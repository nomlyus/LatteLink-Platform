import { describe, expect, it } from "vitest";
import { profileBirthdayValue } from "../src/account/profileDate";

describe("profile birthday calendar serialization", () => {
  it("retains local year, month and day without converting through UTC", () => {
    expect(profileBirthdayValue(new Date(1997, 3, 9, 0, 0))).toBe("1997-04-09");
    expect(profileBirthdayValue(new Date(2000, 1, 29, 23, 59))).toBe("2000-02-29");
  });
  it("doesn't submit invalid or missing dates", () => {
    expect(profileBirthdayValue(null)).toBeUndefined();
    expect(profileBirthdayValue(new Date("invalid"))).toBeUndefined();
  });
});
