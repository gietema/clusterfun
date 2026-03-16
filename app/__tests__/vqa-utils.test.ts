import { parseChoices, answerToChoiceIndex } from "@/app/lib/vqa-utils";

describe("parseChoices", () => {
  it("parses JSON array string", () => {
    expect(parseChoices('["cat", "dog", "bird"]')).toEqual([
      "cat",
      "dog",
      "bird",
    ]);
  });

  it("parses Python repr list with single quotes", () => {
    expect(parseChoices("['cat', 'dog']")).toEqual(["cat", "dog"]);
  });

  it("returns null for non-list string", () => {
    expect(parseChoices("just a string")).toBeNull();
  });

  it("returns null for null", () => {
    expect(parseChoices(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseChoices(undefined)).toBeNull();
  });

  it("returns null for number", () => {
    expect(parseChoices(42)).toBeNull();
  });

  it("handles array input defensively", () => {
    expect(parseChoices(["a", "b"])).toEqual(["a", "b"]);
  });

  it("converts non-string array items to strings", () => {
    expect(parseChoices("[1, 2, 3]")).toEqual(["1", "2", "3"]);
  });

  it("returns null for empty string", () => {
    expect(parseChoices("")).toBeNull();
  });

  it("parses empty array", () => {
    expect(parseChoices("[]")).toEqual([]);
  });
});

describe("answerToChoiceIndex", () => {
  const choices = ["cat", "dog", "bird", "fish"];

  it("maps letter A to index 0", () => {
    expect(answerToChoiceIndex("A", choices)).toBe(0);
  });

  it("maps letter D to index 3", () => {
    expect(answerToChoiceIndex("D", choices)).toBe(3);
  });

  it("maps numeric string '0' to index 0", () => {
    expect(answerToChoiceIndex("0", choices)).toBe(0);
  });

  it("maps numeric string '2' to index 2", () => {
    expect(answerToChoiceIndex("2", choices)).toBe(2);
  });

  it("maps numeric value 1 to index 1", () => {
    expect(answerToChoiceIndex(1, choices)).toBe(1);
  });

  it("returns -1 for text answer that is not a letter/index", () => {
    expect(answerToChoiceIndex("cat", choices)).toBe(-1);
  });

  it("returns -1 for out-of-range letter", () => {
    expect(answerToChoiceIndex("Z", choices)).toBe(-1);
  });

  it("returns -1 for null answer", () => {
    expect(answerToChoiceIndex(null, choices)).toBe(-1);
  });

  it("returns -1 for empty choices", () => {
    expect(answerToChoiceIndex("A", [])).toBe(-1);
  });

  it("returns -1 for negative number", () => {
    expect(answerToChoiceIndex(-1, choices)).toBe(-1);
  });
});
