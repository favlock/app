import { describe, expect, it } from "vitest";
import {
  evaluatePasswordStrength,
  MIN_PASSWORD_LENGTH,
} from "./passwordPolicy";

describe("password policy", () => {
  it("enforces an eight-character minimum", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(evaluatePasswordStrength("short")).toEqual({
      level: 1,
      label: "Weak",
    });
  });

  it("rewards length", () => {
    expect(evaluatePasswordStrength("eight888").label).toBe("Fair");
    expect(evaluatePasswordStrength("a useful phrase").label).toBe("Good");
    expect(evaluatePasswordStrength("a much longer passphrase").label).toBe(
      "Strong",
    );
  });

  it("includes lowercase, uppercase, numbers, and symbols in the score", () => {
    expect(evaluatePasswordStrength("onlylower").label).toBe("Weak");
    expect(evaluatePasswordStrength("lower123").label).toBe("Fair");
    expect(evaluatePasswordStrength("Lower123").label).toBe("Good");
    expect(evaluatePasswordStrength("Lower12!").label).toBe("Good");
    expect(evaluatePasswordStrength("LongerPass1!").label).toBe("Strong");
  });

  it("does not reward common or repetitive passwords", () => {
    expect(evaluatePasswordStrength("password1").label).toBe("Weak");
    expect(evaluatePasswordStrength("aaaaaaaaaaaa").label).toBe("Weak");
  });
});
