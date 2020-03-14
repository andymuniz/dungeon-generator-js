import p5 from "p5";
import React from "react";

let myp5 = new p5();

let heightDist = new Map(),
  widthDist = new Map();

let AABB = class {
  constructor() {
    this.LL = [0, 0];
    this.LR = [0, 0];
    this.UR = [0, 0];
    this.UL = [0, 0];
  }
};

let Room = class {
  constructor() {
    // Default Values
    this.position = [0, 0, 0];
    this.height = 0;
    this.width = 0;
    this.halfHeight = 0;
    this.halfWidth = 0;
    this.roomSizeRatio = 0;
    this.isTrueRoom = false;
    this.isFillerCell = false;
    this.isConnected = false;
    this.isCorridorCell = false;
    this.AABB = new AABB();

    // Assign based on arguments (instead of multiple constructors)
    // TODO: do some checks and assertions and throw errors.
    switch (arguments.length) {
      case 2: // [], int
        let x = arguments[0][0],
          y = arguments[0][1],
          z = arguments[1];
        this.position = [x, y, z];
        this.isTrueRoom = false;
        this.setEdgeSizes(1, 1);
        this.setAABB();
        this.isTrueRoom = this.isConnected = this.isCorridorCell = false;
        this.isFillerCell = true;
        break;
      case 3: // int, int, int
        this.position = [...arguments];
        this.isTrueRoom = this.isFillerCell = this.isConnected = this.isCorridorCell = false;
        break;
      case 4: // int, int, int, int
        let x1 = arguments[0],
          y1 = arguments[1],
          width = arguments[2],
          height = arguments[3];
        let left = x1,
          right = x1,
          bottom = y1,
          top = y1;

        if (width < 0) left += width;
        else right += width;

        if (height < 0) bottom += height;
        else top += height;

        this.position = [(left + right) / 2, (top + bottom) / 2, -5];
        this.isTrueRoom = false;
        this.setEdgeSizes(top - bottom, right - left);
        this.setAABB();
        this.isTrueRoom = false;
        this.isCorridorCell = true;
        this.isFillerCell = false;

        break;

      default:
        throw new Error("Unexpected number of arguments for Room constructor");
    }
  }

  setPosition(x, y) {
    this.position = [x, y, this.position[2]];
  }

  setEdgeSizes(height, width) {
    this.height = height;
    this.width = width;
    this.setHalfEdgeSizes();
  }

  setHalfEdgeSizes() {
    this.halfWidth = this.width / 2;
    this.halfHeight = this.height / 2;
  }

  setAABB() {
    this.halfWidth = this.width / 2;
    this.halfHeight = this.height / 2;
    this.AABB.LL[0] = 0 - this.halfWidth;
    this.AABB.LL[1] = 0 - this.halfHeight;
    this.AABB.LR[0] = 0 + this.halfWidth;
    this.AABB.LR[1] = 0 - this.halfHeight;
    this.AABB.UR[0] = 0 + this.halfWidth;
    this.AABB.UR[1] = 0 + this.halfHeight;
    this.AABB.UL[0] = 0 - this.halfWidth;
    this.AABB.UL[1] = 0 + this.halfHeight;
  }

  setConnected(bool) {
    this.isConnected = bool;
  }

  getPosition = () => this.position;

  getHeight = () => this.height;

  getWidth = () => this.width;

  getAABB = () => this.AABB;

  getTop(padding = 0) {
    return this.position[1] + this.halfHeight + padding;
  }

  getBottom(padding = 0) {
    return this.position[1] - this.halfHeight - padding;
  }

  getLeft(padding = 0) {
    return this.position[0] - this.halfWidth - padding;
  }

  getRight(padding = 0) {
    return this.position[0] + this.halfWidth + padding;
  }

  shift(dx, dy) {
    this.position[0] += dx;
    this.position[1] += dy;
    this.setAABB();
  }

  expand(by) {
    this.setEdgeSizes(this.height + by * 2, this.width + by * 2);
    this.setAABB();
  }

  overlaps(B, padding = 0) {
    let A = this;
    return !(
      B.getLeft(padding) >= A.getRight(padding) ||
      B.getRight(padding) <= A.getLeft(padding) ||
      B.getTop(padding) <= A.getBottom(padding) ||
      B.getBottom(padding) >= A.getTop(padding)
    );
  }

  markIfTrueRoom(minWidth, minHeight) {
    if (this.width >= minWidth && this.height >= minHeight) {
      this.isConnected = true;
      this.isTrueRoom = true;
      return true;
    }
    return false;
  }
};

let DungeonGenerator = class {
  constructor() {
    this.numCells = 150;
    this.origin = [0, 0];
    this.domainMin = this.rangeMin = 0;
    this.domainMax = this.rangeMax = 100;
    this.minRoomSizeRatio = 0.9;
    this.maxRoomSizeRatio = 1.5;
    this.maxRoomEdgeSize = 15;
    // Change these constraints to get more or less TRUE rooms!
    this.minRoomEdgeHeight = 9;
    this.minRoomEdgeWidth = 9;

    this.dungeonSize = 100;

    this.tileRoomMap = new Map();
    this.rooms = [];
    this.trueRooms = [];
    this.corridorRooms = [];
    this.graph = new Map();
  }

  getNumCells = () => this.numCells;

  getRooms = () => this.rooms;

  getGraph = () => this.graph;

  getTileMap = () => this.tileRoomMap;

  generateDungeon = () => {
    this.generateCellCoordinates();
    this.generateCellRectangles();
    this.markTrueRooms();

    for (let i = 0; i < this.trueRooms.length; i++) {
      this.trueRooms[i].expand(1);
    }

    do {
      this.seperateTrueRooms();
      this.seperateCellRectangles();
    } while (this.roomsTooClose(5));

    this.markAllTileMap(this.rooms);
    this.fillSmallCellGaps();

    this.constructGraph();

    {
      let dx, dy, x, y;
      let A, B;
      for (let i = 0; i < this.trueRooms.length; i++) {
        let outer = this.trueRooms[i];
        let edges = this.graph.get(outer);

        for (let j = 0; j < edges.length; j++) {
          let inner = edges[j];
          if (outer.getPosition()[0] < inner.getPosition()[0]) {
            A = outer;
            B = inner;
          } else {
            A = inner;
            B = outer;
          }

          x = A.getPosition()[0];
          y = A.getPosition()[1];
          dx = B.getPosition()[0] - x;
          dy = B.getPosition()[1] - y;

          if ((Math.random() * 100) % 2 === 1) {
            this.rooms.push(new Room(x, y, dx + 1, 1));
            this.corridorRooms.push(this.rooms[this.rooms.length - 1]);
            this.rooms.push(new Room(x + dx, y, 1, dy));
            this.corridorRooms.push(this.rooms[this.rooms.length - 1]);
          } else {
            this.rooms.push(new Room(x, y + dy, dx + 1, 1));
            this.corridorRooms.push(this.rooms[this.rooms.length - 1]);
            this.rooms.push(new Room(x, y, 1, dy));
            this.corridorRooms.push(this.rooms[this.rooms.length - 1]);
          }
        }
      }
    }

    for (let i = 0; i < this.corridorRooms.length; i++) {
      let room = this.corridorRooms[i];
      room.expand(1);
    }

    this.removeUntouchedCells();

    for (let i = 0; i < this.rooms.length; i++) {
      let room = this.rooms[i];
      if (!room.isConnected) {
        this.rooms.splice(i, 1);
      } else {
        ++i;
      }
    }

    this.tileRoomMap.clear();
    this.markAllTileMap(this.rooms);
  };

  generateCellCoordinates() {
    for (let i = 0; i < this.numCells; i++) {
      this.rooms.push(new Room(Math.random() * 100, Math.random() * 100));
    }
  }

  generateCellRectangles() {
    let IsDebug = process.env.DEBUG;

    //Generate width and length of each Room. Use Parker-Normal Distribution. We want the edges to be even whole numbers.
    for (let i = 0; i < this.rooms.length; i++) {
      let room = this.rooms[i];
      let height = (myp5.randomGaussian(4.0, 3.0) % this.maxRoomEdgeSize) + 1;
      if (height % 2 !== 0) height++;
      let width =
        Math.random() * (height * 1.5 - height * 0.5) + height * 0.5 + 1;
      if (width % 2 !== 0) width++;

      room.setEdgeSizes(height, width);

      if (IsDebug) {
        console.log(
          `X: ${room.getPosition()[0]}      Y: ${
            room.getPosition()[1]
          }     Z: ${room.getPosition()[2]}`
        );
        console.log(
          `Height: ${room.getHeight()}      Width: ${room.getWidth()}`
        );
        if (!heightDist.has(height)) heightDist.set(height, 1);
        else heightDist.set(height, heightDist.get(height) + 1);

        if (!widthDist.has(width)) widthDist.set(width, 1);
        else widthDist.set(width, widthDist.get(width) + 1);
      }
    }
    // Debugging
    if (IsDebug) {
      console.log(`-Height distribution-`);
      heightDist.forEach((value, key, map) => {
        console.log(
          `${key}: ${() => {
            for (let i = 0; i < value; i++) {
              return "*";
            }
          }}`
        );
      });
      widthDist.forEach((value, key, map) => {
        console.log(
          `${key}: ${() => {
            for (let i = 0; i < value; i++) {
              return "*";
            }
          }}`
        );
      });
      console.log(`-Width distribution-`);
    }

    //Generate "Rectangles" (AABB data) for each room
    for (let i = 0; i < this.rooms.length; i++) {
      let room = this.rooms[i];
      room.setAABB();
    }
  }

  seperateTrueRooms() {
    let IsDebug = process.env.DEBUG === "true";

    let iterations = 0,
      padding = 6;

    let A,
      B,
      dx,
      dxa,
      dxb,
      dy,
      dya,
      dyb,
      touching = false;

    do {
      if (IsDebug) {
        console.log(`Starting # of iteration: ${iterations}`);
      }

      touching = false;
      for (let i = 0; i < this.trueRooms.length; i++) {
        A = this.trueRooms[i];
        for (let j = i + 1; j < this.trueRooms.length; j++) {
          B = this.trueRooms[j];
          if (A.overlaps(B, padding)) {
            touching = true;

            dx = Math.min(
              A.getRight(padding) - B.getLeft(padding),
              A.getLeft(padding) - B.getRight(padding)
            );
            dy = Math.min(
              A.getBottom(padding) - B.getTop(padding),
              A.getTop(padding) - B.getBottom(padding)
            );

            if (Math.abs(dx) < Math.abs(dy)) dy = 0;
            else dx = 0;

            dxa = Math.ceil(-dx / 2);
            dxb = Math.ceil(dx + dxa);
            dya = Math.ceil(-dy / 2);
            dyb = Math.ceil(dy + dya);

            A.shift(dxa, dya);
            B.shift(dxb, dyb);
          }
        }
      }
    } while (touching === true);

    if (IsDebug) {
      console.log(`Out of loop.\n# of iterations: ${iterations}`);
    }
  }

  seperateCellRectangles() {
    let IsDebug = process.env.DEBUG === "true";

    let iterations = 0,
      padding = 0;

    let A,
      B,
      dx,
      dxa,
      dxb,
      dy,
      dya,
      dyb,
      touching = false;

    do {
      if (IsDebug) {
        console.log(`Starting # of iterations: ${iterations}`);
      }

      touching = false;
      for (let i = 0; i < this.rooms.length; i++) {
        A = this.rooms[i];
        for (let j = i + 1; j < this.rooms.length; j++) {
          B = this.rooms[j];
          if (A.overlaps(B, padding)) {
            touching = true;

            dx = Math.min(
              A.getRight(padding) - B.getLeft(padding),
              A.getLeft(padding) - B.getRight(padding)
            );
            dy = Math.min(
              A.getBottom(padding) - B.getTop(padding),
              A.getTop(padding) - B.getBottom(padding)
            );
          }

          if (Math.abs(dx) < Math.abs(dy)) dy = 0;
          else dx = 0;

          dxa = Math.ceil(-dx / 2);
          dxb = Math.ceil(dx + dxa);

          dya = Math.ceil(-dy / 2);
          dyb = Math.ceil(dy + dya);

          A.shift(dxa, dya);
          B.shift(dxb, dyb);
        }
      }
    } while (touching === true);
    if (IsDebug === true) {
      console.log(`Out of loop.\n# of iterations: ${iterations}`);
    }
  }

  roomsTooClose(padding) {
    let A, B;
    for (let i = 0; i < this.trueRooms.length; i++) {
      A = this.trueRooms[i];
      for (let j = i + 1; j < this.trueRooms.length; j++) {
        B = this.trueRooms[j];
        if (A.overlaps(B, padding)) {
          return true;
        }
      }
    }
    return false;
  }

  markTileMap(A) {
    for (let x = A.getLeft(); x < A.getRight(); x++) {
      for (let y = A.getBottom(); y < A.getTop(); y++) {
        let pos = [x + 0.5, y + 0.5];
        if (!this.tileRoomMap.has(pos)) {
          this.tileRoomMap.set(pos, A);
        } else {
          if (this.tileRoomMap.get(pos).isTrueRoom) {
            continue;
          }
          if (this.tileRoomMap.get(pos).isCorridorCell) {
            continue;
          }
          this.tileRoomMap.set(pos, A);
        }
      }
    }
  }

  markAllTileMap(arrayOfRooms) {
    for (let i = 0; i < arrayOfRooms.length; i++) {
      let room = arrayOfRooms[i];
      this.markTileMap(room);
    }
  }

  markTrueRooms() {
    for (let i = 0; i < this.rooms.length; i++) {
      let room = this.rooms[i];
      if (room.markIfTrueRoom(this.minRoomEdgeWidth, this.minRoomEdgeHeight)) {
        this.trueRooms.push(room);
      }
    }
  }

  fillSmallCellGaps() {
    let point = [0, 0];
    this.tileRoomMap.forEach((value, key, map) => {
      point = key;
      let point2 = [0, 0],
        point3 = [0, 0];

      //Check for gap above
      point2 = [point[0], point[1] + 1];
      point3 = [point2[0], point2[1] + 1];
      if (!this.tileRoomMap.has(point2)) {
        if (!this.tileRoomMap.has(point3)) {
          this.rooms.push(new Room(point2));
          this.markTileMap(this.rooms[this.rooms.length - 1]);
        }
      } else {
        // point exists, so no gap exists
      }

      //Check for gap below
      point2 = [point[0], point[1] - 1];
      point3 = [point2[0], point2[1] - 1];
      if (!this.tileRoomMap.has(point2)) {
        if (!this.tileRoomMap.has(point3)) {
          this.rooms.push(new Room(point2));
          this.markTileMap(this.rooms[this.rooms.length - 1]);
        }
      } else {
        //point exists, so no gap exists
      }

      //Check for gap to left
      point2 = [point[0] - 1, point[1]];
      point3 = [point2[0] - 1, point2[1]];
      if (!this.tileRoomMap.has(point2)) {
        if (!this.tileRoomMap.has(point3)) {
          this.rooms.push(new Room(point2));
          this.markTileMap(this.rooms[this.rooms.length - 1]);
        }
      } else {
        //point exists, so no gap exists
      }

      //Check for gap to right
      point2 = [point[0] + 1, point[1]];
      point3 = [point2[0] + 1, point2[1]];
      if (!this.tileRoomMap.has(point2)) {
        if (!this.tileRoomMap.has(point3)) {
          this.rooms.push(new Room(point2));
          this.markTileMap(this.rooms[this.rooms.length - 1]);
        }
      } else {
        //point exists, so no gap exists
      }
    });
  }

  constructGraph() {
    let A, B, C;
    let abDist, acDist, bcDist;
    let skip;

    for (let i = 0; i < this.trueRooms.length; i++) {
      A = this.trueRooms[i];
      for (let j = i + 1; j < this.trueRooms.length; j++) {
        skip = false;
        B = this.trueRooms[j];

        abDist =
          Math.pow(A.getPosition()[0] - B.getPosition()[0], 2) +
          Math.pow(A.getPosition()[1] - B.getPosition[1], 2);

        for (let k = 0; k < this.trueRooms.length; k++) {
          if (k === i || k === j) continue;
          C = this.trueRooms[k];

          acDist =
            Math.pow(A.getPosition()[0] - C.getPosition()[0], 2) +
            Math.pow(A.getPosition()[1] - C.getPosition()[1], 2);
          bcDist =
            Math.pow(B.getPosition()[0] - C.getPosition()[0], 2) +
            Math.pow(B.getPosition()[1] - C.getPosition()[1], 2);

          if (acDist < abDist && bcDist < abDist) skip = true;
          if (skip) break;
        }
        if (!skip) {
          if (!this.graph.has(A)) {
            this.graph.set(A, []);
          }
          this.graph.get(A).push(B);
        }
      }
    }
  }

  removeUntouchedCells() {
    for (let i = 0; i < this.corridorRooms.length; i++) {
      for (let j = 0; j < this.rooms.length; j++) {
        let corridor = this.corridorRooms[i];
        let room = this.rooms[j];
        if (room.isConnected) continue;
        if (corridor.overlaps(room, 0.5)) {
          room.setConnected(true);
        }
      }
    }
  }

  // TODO: return html markup
  dummyGenerateDungeon = () => <div>Hello!</div>;
};

function Dungeon() {
  let dungeonGenerator = new DungeonGenerator();
  dungeonGenerator.generateDungeon();
  return dungeonGenerator.dummyGenerateDungeon();
}

export default Dungeon;
