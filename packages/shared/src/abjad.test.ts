import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateAbjadValue, calculateRemainder } from "./abjad";

test("hamza alef forms count as 1", () => {
  assert.equal(calculateAbjadValue("أ"), 1);
  assert.equal(calculateAbjadValue("إ"), 1);
  assert.equal(calculateAbjadValue("آ"), 1);
  assert.equal(calculateAbjadValue("أسد"), 65);
});

test("taa marbuta counts as 400", () => {
  assert.equal(calculateAbjadValue("ة"), 400);
  assert.equal(calculateAbjadValue("بركة"), 2 + 200 + 20 + 400);
});

test("alef maqsura counts as 10", () => {
  assert.equal(calculateAbjadValue("ى"), 10);
  assert.equal(calculateAbjadValue("ندى"), 50 + 4 + 10);
});

test("diacritics are ignored", () => {
  assert.equal(calculateAbjadValue("بَرَكَة"), calculateAbjadValue("بركة"));
});

test("only the letter skeleton counts (shadda and tanween ignored)", () => {
  assert.equal(calculateAbjadValue("مُتَوَّجٌ"), calculateAbjadValue("متوج"));
  assert.equal(calculateAbjadValue("متوج"), 40 + 400 + 6 + 3);
});

test("remainder is mod 9 and 0 is treated as 9", () => {
  assert.equal(calculateRemainder(18), 9);
  assert.equal(calculateRemainder(8803), 1);
  assert.equal(calculateRemainder(8780), 5);
});
