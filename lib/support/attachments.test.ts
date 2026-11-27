import { describe, expect, it } from "vitest";
import { MAX_FILE_BYTES, checkFile, safeDownloadName, storedName } from "./attachments";
import { renderTemplate } from "./templates";
import { csvCell, toCsv } from "./csv";

const bytes = (...b: number[]): ArrayBuffer => new Uint8Array([...b, 0, 0, 0, 0, 0, 0, 0, 0]).buffer;
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d), PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), JPG = bytes(0xff, 0xd8, 0xff);

describe("ticket attachments", () => {
  it("accepts a real PDF, PNG and JPEG", () => {
    expect(checkFile("a.pdf", "application/pdf", 100, PDF).ok).toBe(true);
    expect(checkFile("a.PNG", "image/png", 100, PNG).ok).toBe(true);
    expect(checkFile("a.jpeg", "image/jpeg", 100, JPG).ok).toBe(true);
  });
  it("refuses a file that lies about its type, wrong extensions, other types, empty and oversize files", () => {
    expect(checkFile("a.pdf", "application/pdf", 100, PNG).ok).toBe(false);
    expect(checkFile("a.exe", "application/pdf", 100, PDF).ok).toBe(false);
    expect(checkFile("a.html", "text/html", 100, PDF).ok).toBe(false);
    expect(checkFile("a.pdf", "application/pdf", 0, PDF).ok).toBe(false);
    expect(checkFile("a.pdf", "application/pdf", MAX_FILE_BYTES + 1, PDF).ok).toBe(false);
  });
  it("stores under a random name and sanitises download names", () => {
    expect(storedName(".pdf")).toMatch(/^\d+-[a-f0-9]{16}\.pdf$/);
    expect(storedName(".pdf")).not.toBe(storedName(".pdf"));
    expect(safeDownloadName('a"b\r\nc.pdf')).toBe("a_b__c.pdf");
  });
});

describe("reply templates and CSV", () => {
  it("fills {name} with the first name and {order} with the reference", () => {
    expect(renderTemplate("Hi {name}, about {order}.", { name: "Asha Verma", order: "ORD-9" })).toBe("Hi Asha, about ORD-9.");
    expect(renderTemplate("Hi {name}, about {order}.", { name: "", order: "" })).toBe("Hi there, about your request.");
  });
  it("quotes cells, and neutralises spreadsheet formulas", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell(null)).toBe("");
    expect(toCsv(["a", "b"], [{ a: 1, b: "x,y" }])).toBe('﻿a,b\r\n1,"x,y"');
  });
});
