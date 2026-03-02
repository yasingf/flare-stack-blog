import { describe, expect, it } from "vitest";
import { decodeId, encodeId, isShortId } from "@/lib/short-id";

describe("short-id", () => {
  describe("encodeId / decodeId", () => {
    it("should round-trip encode and decode", () => {
      for (const id of [1, 2, 3, 10, 100, 1000, 99999, 1000000]) {
        const encoded = encodeId(id);
        const decoded = decodeId(encoded);
        expect(decoded).toBe(id);
      }
    });

    it("should produce 8-char base36 strings", () => {
      for (let i = 1; i <= 20; i++) {
        const encoded = encodeId(i);
        expect(encoded).toMatch(/^[0-9a-z]{8}$/);
      }
    });

    it("should produce non-sequential outputs for sequential inputs", () => {
      const encoded1 = encodeId(1);
      const encoded2 = encodeId(2);
      const encoded3 = encodeId(3);

      // All should be different
      expect(encoded1).not.toBe(encoded2);
      expect(encoded2).not.toBe(encoded3);
      expect(encoded1).not.toBe(encoded3);

      // They shouldn't be numerically adjacent (non-sequential)
      const num1 = parseInt(encoded1, 36);
      const num2 = parseInt(encoded2, 36);
      expect(Math.abs(num2 - num1)).toBeGreaterThan(1);
    });

    it("should throw for invalid inputs", () => {
      expect(() => encodeId(0)).toThrow();
      expect(() => encodeId(-1)).toThrow();
      expect(() => encodeId(1.5)).toThrow();
      expect(() => decodeId("abc")).toThrow();
      expect(() => decodeId("ABCDEFGH")).toThrow();
      expect(() => decodeId("")).toThrow();
    });
  });

  describe("isShortId", () => {
    it("should validate correct short IDs", () => {
      expect(isShortId("00ar5g7v")).toBe(true);
      expect(isShortId("abcdefgh")).toBe(true);
      expect(isShortId("12345678")).toBe(true);
    });

    it("should reject invalid short IDs", () => {
      expect(isShortId("abc")).toBe(false); // too short
      expect(isShortId("abcdefghi")).toBe(false); // too long
      expect(isShortId("ABCDEFGH")).toBe(false); // uppercase
      expect(isShortId("abc-defg")).toBe(false); // contains dash
      expect(isShortId("my-slug!")).toBe(false); // special chars
    });
  });
});
