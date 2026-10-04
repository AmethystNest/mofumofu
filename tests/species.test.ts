import { describe, expect, it } from "vitest";
import { cleanName, sp } from "../src/content/species";

describe("species text", () => {
  it("犬のときは文言を変えない", () => {
    expect(sp("犬は扉のそばで、こちらを見ていた。", "dog")).toBe("犬は扉のそばで、こちらを見ていた。");
  });
  it("猫のときは「犬」を「猫」にする", () => {
    expect(sp("犬が毛布の端を鼻で押した。犬用ごはん", "cat")).toBe("猫が毛布の端を鼻で押した。猫用ごはん");
  });
  it("猫のときはドッグフードをキャットフードにする", () => {
    expect(sp("ドッグフードをあげた。", "cat")).toBe("キャットフードをあげた。");
  });
  it("名称は8文字まで・空は不可", () => {
    expect(cleanName("  ミケ ")).toBe("ミケ");
    expect(cleanName("あいうえおかきくけこ")).toBe("あいうえおかきく");
    expect(cleanName("   ")).toBeNull();
  });
});
