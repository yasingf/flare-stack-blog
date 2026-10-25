// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { schemaExtensions } from "@/features/posts/editor/schema";
import { extractAllImageKeys } from "@/features/posts/utils/content";
import { isPostBodyEmpty } from "@/features/posts/utils/is-post-body-empty";
import { jsonToMarkdown, markdownToHtml } from "./markdown-converter";

describe("fork editor compatibility", () => {
  it("round trips guitar embeds without losing file names or media references", async () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "guitarPro",
          attrs: { src: "/images/song.gp5", fileName: 'Song "Live" & More' },
        },
      ],
    };
    const editor = new Editor({
      extensions: schemaExtensions,
      content: await markdownToHtml(jsonToMarkdown(content)),
    });
    try {
      const result = editor.getJSON();
      expect(
        result.content?.find((node) => node.type === "guitarPro")?.attrs,
      ).toEqual(content.content[0].attrs);
      expect(isPostBodyEmpty(result)).toBe(false);
      expect(extractAllImageKeys(result)).toEqual(["song.gp5"]);
      editor.commands.setContent(editor.getHTML());
      expect(
        editor.getJSON().content?.find((node) => node.type === "guitarPro")
          ?.attrs,
      ).toEqual(content.content[0].attrs);
    } finally {
      editor.destroy();
    }
  });
  it("keeps upstream video and math nodes while sanitizing source HTML", async () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "video",
          attrs: {
            provider: "youtube",
            videoId: "dQw4w9WgXcQ",
            title: "Video",
            page: null,
            start: 30,
            cover: null,
            duration: null,
          },
        },
        { type: "blockMath", attrs: { latex: "x^2" } },
      ],
    };
    const html = await markdownToHtml(
      jsonToMarkdown(content) +
        '\n<script>alert(1)</script><img src="x" onerror="alert(1)">',
    );
    expect(html).not.toMatch(/<script|onerror=/);
    const editor = new Editor({ extensions: schemaExtensions, content: html });
    try {
      expect(editor.getJSON().content).toEqual(
        expect.arrayContaining(content.content),
      );
    } finally {
      editor.destroy();
    }
  });
});
