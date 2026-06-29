const assert = require("node:assert/strict");
const {
  parseCallNumber,
  extractCallNumber,
  callNumberFromOcr,
  ocrSupportMessage,
  ocrResultMessage,
  inputStatusMessage,
  dataStatusMessage,
  findShelf,
  resolveSelectedShelf,
  shelfGuide,
  sortBooks,
  calculateOcrStats,
  calculateRoute,
  routeText,
  routeMarkers,
  parseRouteGraph,
  usableRouteGraph,
  parseShelvesCsv,
  usableShelves,
  parseLabelsCsv,
  shelfMapClass,
  mapShelves,
} = require("./app.js");

const shelves = [
  {
    shelf_id: "8B",
    label: "1층 꿈뜨락-아동-8B",
    category: "아동",
    start_call_number: "아동 219.2-2020-1-9",
    end_call_number: "아동 219.2-2020-1-9",
    direction: "현장 조사 필요",
    slot_no: 1,
    slot_start_call_number: "아동 219.2-2020-1-9",
    slot_end_call_number: "아동 219.2-2020-1-9",
    map_x: 12.5,
    map_y: 34.5,
    map_width: 11,
    map_height: 11,
  },
];

function run() {
  assert.deepEqual(parseCallNumber("아동 219.2-2020-1-9"), {
    category: "아동",
    classNumber: 219.2,
    year: 2020,
    copy: "1-9",
    raw: "아동 219.2-2020-1-9",
    sortKey: "아동|000219.200|2020|000001|000009",
  });

  assert.equal(parseCallNumber(" 아동   219.2 2020 1 9 ").raw, "아동 219.2-2020-1-9");
  assert.equal(parseCallNumber("아등 2I9.2-202O-1-9").raw, "아동 219.2-2020-1-9");
  assert.equal(parseCallNumber("분류없음"), null);
  assert.equal(extractCallNumber("등록번호 AYE000067710\n아동 219.2-2020-1-9\n꿈뜨락"), "아동 219.2-2020-1-9");
  assert.equal(callNumberFromOcr("등록번호 AYE000067710\n아동 219.2-2020-1-9\n꿈뜨락"), "아동 219.2-2020-1-9");
  assert.equal(callNumberFromOcr("읽을 수 없는 라벨"), "읽을 수 없는 라벨");
  assert.equal(ocrSupportMessage({ TextDetector: function TextDetector() {} }), "기기 OCR 지원됨. 촬영하면 자동 입력합니다.");
  assert.equal(ocrSupportMessage({ TextDetector: function TextDetector() {}, isSecureContext: false }), "기기 OCR 미지원. 촬영 후 직접 입력으로 진행합니다.");
  assert.equal(ocrSupportMessage({}), "기기 OCR 미지원. 촬영 후 직접 입력으로 진행합니다.");
  assert.equal(ocrResultMessage(""), "OCR 결과가 없습니다. 청구기호를 직접 입력해 주세요.");
  assert.equal(ocrResultMessage("아동 219.2-2020-1-9"), "OCR 결과를 청구기호 입력칸에 넣었습니다.");
  assert.equal(inputStatusMessage("아동 219.2-2020-1-9"), "청구기호 확인됨. 목적지와 경로를 확인하세요.");
  assert.equal(inputStatusMessage("분류없음"), "청구기호를 확인해 주세요.");
  assert.equal(dataStatusMessage({ shelves: "csv", graph: "fallback", labels: "csv" }), "서가 CSV 반영됨 · 경로 기본값 사용 · OCR CSV 반영됨");

  assert.equal(findShelf(parseCallNumber("아동 219.2-2020-1-9"), shelves).status, "one");
  assert.equal(findShelf(parseCallNumber("아동 219.2-2020-1-9"), shelves).shelf.shelf_id, "8B");
  assert.equal(findShelf(parseCallNumber("아동 219.2-2020-1-9"), [
    { ...shelves[0], slot_no: 1, slot_start_call_number: "아동 219.2-2020-1-1", slot_end_call_number: "아동 219.2-2020-1-3" },
    { ...shelves[0], slot_no: 2, slot_start_call_number: "아동 219.2-2020-1-4", slot_end_call_number: "아동 219.2-2020-1-9" },
  ]).shelf.slot_no, 2);
  assert.equal(shelfGuide({ ...shelves[0], slot_no: 2, slot_start_call_number: "아동 219.2-2020-1-4", slot_end_call_number: "아동 219.2-2020-1-9" }), "1층 꿈뜨락-아동-8B · 위에서 2번째 칸 · 아동 219.2-2020-1-4 ~ 아동 219.2-2020-1-9 · 현장 조사 필요");
  assert.equal(findShelf(parseCallNumber("아동 101.0-2020-1"), shelves).status, "none");
  assert.equal(findShelf(parseCallNumber("아동 219.2-2020-1-9"), [{
    ...shelves[0],
    start_call_number: "아동 219.2-2021-1",
    end_call_number: "아동 219.2-2021-9",
    slot_start_call_number: "아동 219.2-2021-1",
    slot_end_call_number: "아동 219.2-2021-9",
  }]).status, "none");
  const overlappingShelves = [shelves[0], { ...shelves[0], shelf_id: "8C", label: "1층 꿈뜨락-아동-8C" }];
  const candidateMatch = findShelf(parseCallNumber("아동 219.2-2020-1-9"), overlappingShelves);
  assert.equal(candidateMatch.status, "candidates");
  assert.equal(resolveSelectedShelf(candidateMatch, "8C").shelf_id, "8C");
  assert.equal(resolveSelectedShelf(candidateMatch, "없음"), null);
  assert.equal(shelfMapClass(shelves[0], "8B"), "shelf active");
  assert.equal(shelfMapClass(shelves[0], "8C"), "shelf");
  assert.deepEqual(mapShelves([shelves[0], { ...shelves[0], slot_no: 2 }]), [shelves[0]]);

  assert.deepEqual(
    sortBooks(
      [
        { title: "B", callNumber: "아동 219.2-2020-1-9" },
        { title: "A", callNumber: "아동 101.0-2020-1" },
        { title: "X", callNumber: "분류없음" },
      ],
      shelves,
    ).map((book) => book.title),
    ["B", "A", "X"],
  );

  assert.deepEqual(calculateOcrStats([
    { expected_call_number: "아동 219.2-2020-1-9", ocr_call_number: "아동 219.2-2020-1-9" },
    { expected_call_number: "아동 101.0-2020-1", ocr_call_number: "아동 101.0-2020-I" },
  ]), { total: 2, autoConfirmed: 1, rate: 50 });

  assert.deepEqual(calculateRoute(shelves[0]), {
    points: [{ x: 6, y: 94 }, { x: 18, y: 94 }, { x: 18, y: 48 }, { x: 18, y: 40 }],
    label: "입구에서 8B까지 통로 기준 약 66칸",
    steps: ["오른쪽 12칸", "위쪽 46칸", "위쪽 8칸"],
  });
  assert.deepEqual(routeMarkers(calculateRoute(shelves[0])), {
    start: { x: 6, y: 94 },
    end: { x: 18, y: 40 },
  });

  assert.deepEqual(calculateRoute({ ...shelves[0], shelf_id: "T" }, {
    nodes: {
      entrance: { x: 0, y: 0 },
      short: { x: 3, y: 4 },
      long: { x: 0, y: 9 },
      T: { x: 6, y: 8 },
    },
    edges: [["entrance", "short"], ["short", "T"], ["entrance", "long"], ["long", "T"]],
  }), {
    points: [{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 6, y: 8 }],
    label: "입구에서 T까지 통로 기준 약 10칸",
    steps: ["오른쪽 3칸, 아래쪽 4칸", "오른쪽 3칸, 아래쪽 4칸"],
  });
  assert.equal(calculateRoute(shelves[0], { nodes: {}, edges: [] }), null);
  assert.equal(calculateRoute(shelves[0], {
    nodes: { entrance: { x: 6, y: 94 }, "8B": { x: NaN, y: 40 } },
    edges: [["entrance", "8B"]],
  }), null);
  assert.equal(calculateRoute({ ...shelves[0], shelf_id: "X", map_x: NaN }, {
    nodes: { entrance: { x: 6, y: 94 } },
    edges: [],
  }), null);
  assert.deepEqual(calculateRoute(shelves[0], {
    nodes: { entrance: { x: 6, y: 94 }, "8B": { x: 18, y: 40 } },
    edges: [["entrance", "missing"]],
  }), {
    points: [{ x: 6, y: 94 }, { x: 18, y: 40 }],
    label: "입구에서 8B까지 직선 기준 약 55칸",
    steps: ["오른쪽 12칸, 위쪽 54칸"],
  });
  assert.deepEqual(calculateRoute({ ...shelves[0], shelf_id: "T" }, {
    nodes: { entrance: { x: 0, y: 0 }, T: { x: 1.23456, y: -2.34567 } },
    edges: [["entrance", "T"]],
  }).steps, ["오른쪽 1.2칸, 위쪽 2.3칸"]);
  assert.deepEqual(calculateRoute({ ...shelves[0], shelf_id: "T" }, {
    nodes: { entrance: { x: 0, y: 0 }, same: { x: 0, y: 0 }, T: { x: 0, y: 10 } },
    edges: [["entrance", "same"], ["same", "T"]],
  }).steps, ["아래쪽 10칸"]);
  assert.equal(routeText({ label: "입구에서 T까지 통로 기준 약 0칸", steps: [] }), "입구에서 T까지 통로 기준 약 0칸");
  assert.equal(routeText(null), "목적지를 찾으면 경로가 표시됩니다");

  assert.deepEqual(parseRouteGraph("node_id,x,y,links\nentrance,0,0,short;long\nshort,3,4,T\nlong,0,9,T\nT,6,8,"), {
    nodes: {
      entrance: { x: 0, y: 0 },
      short: { x: 3, y: 4 },
      long: { x: 0, y: 9 },
      T: { x: 6, y: 8 },
    },
    edges: [["entrance", "short"], ["entrance", "long"], ["short", "T"], ["long", "T"]],
  });
  assert.equal(usableRouteGraph(parseRouteGraph("node_id,x,y,links\n8B,18,40,"), shelves), false);
  assert.equal(usableRouteGraph(parseRouteGraph("node_id,x,y,links\nentrance,6,94,\n8B,18,40,"), shelves), false);
  assert.equal(usableRouteGraph(parseRouteGraph("node_id,x,y,links\nentrance,6,94,8B\n8B,x,40,"), shelves), false);
  assert.equal(usableRouteGraph(parseRouteGraph("node_id,x,y,links\nentrance,6,94,8B;missing\n8B,18,40,"), shelves), false);
  assert.equal(usableRouteGraph(parseRouteGraph("node_id,x,y,links\nentrance,6,94,8B\n8B,18,40,"), shelves), true);

  assert.deepEqual(parseShelvesCsv("shelf_id,label,category,start_call_number,end_call_number,direction,map_x,map_y,map_width,map_height\n8B,1층 꿈뜨락-아동-8B,아동,아동 219.2-2020-1-9,아동 219.2-2020-1-9,현장 조사 필요,12.5,34.5,11,11"), shelves);
  assert.equal(usableShelves(shelves), true);
  assert.equal(usableShelves(parseShelvesCsv("shelf_id,label,category,start_call_number,end_call_number,direction,map_x,map_y,map_width,map_height\n8B,깨짐,아동,분류없음,분류없음,현장 조사 필요,x,34.5,11,11")), false);
  assert.equal(usableShelves(parseShelvesCsv("shelf_id,label,category,start_call_number,end_call_number,direction,map_x,map_y,map_width,map_height\n8B,뒤집힘,아동,아동 219.2-2021-1,아동 219.2-2020-1,현장 조사 필요,12.5,34.5,11,11")), false);
  assert.equal(usableShelves(parseShelvesCsv("shelf_id,label,category,start_call_number,end_call_number,direction,map_x,map_y,map_width,map_height\n8B,밖으로나감,아동,아동 219.2-2020-1-9,아동 219.2-2020-1-9,현장 조사 필요,200,34.5,11,11")), false);
  assert.equal(usableShelves(parseShelvesCsv("shelf_id,label,category,start_call_number,end_call_number,direction,map_x,map_y,map_width,map_height\n8B,음수크기,아동,아동 219.2-2020-1-9,아동 219.2-2020-1-9,현장 조사 필요,12.5,34.5,-11,11")), false);
  assert.deepEqual(parseLabelsCsv("image_id,expected_call_number,ocr_call_number,confirmed_call_number,needs_manual_fix\nlabel-001,아동 219.2-2020-1-9,아동 219.2-2020-1-9,아동 219.2-2020-1-9,false"), [
    { image_id: "label-001", expected_call_number: "아동 219.2-2020-1-9", ocr_call_number: "아동 219.2-2020-1-9", confirmed_call_number: "아동 219.2-2020-1-9", needs_manual_fix: "false" },
  ]);
}

run();
console.log("app.test.js passed");
