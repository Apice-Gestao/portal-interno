import { describe, it, expect } from "vitest";
import { uploadFilename } from "../src/portal/portal.service.js";
import { demoPdf, validateEvidence, csvCell } from "@apice/domain";
describe("filename and export integrity", () => {
  it("decodes UTF-8 multipart bytes without corrupting already decoded names", () => {
    for (const name of ["relatório-é.pdf", "漢字.pdf", "arquivo.pdf"]) {
      expect(uploadFilename(Buffer.from(name, "utf8").toString("latin1"))).toBe(
        name,
      );
      expect(uploadFilename(name)).toBe(name);
    }
  });
  it("rejects unpaired Unicode and control characters before storing a filename", async () => {
    for (const name of [
      "arquivo\ud800.pdf",
      "arquivo\u0085.pdf",
      "../arquivo.pdf",
    ])
      await expect(validateEvidence(name, demoPdf())).rejects.toThrow();
    expect(csvCell("\u0085=1+1")).toBe('"\' =1+1"');
  });
});
