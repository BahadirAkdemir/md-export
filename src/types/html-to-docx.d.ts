declare module 'html-to-docx' {
  interface DocxOptions {
    title?: string;
    creator?: string;
    pageNumber?: boolean;
    pageSize?: { width: number; height: number };
    margins?: { top: number; right: number; bottom: number; left: number };
    table?: { row?: { cantSplit?: boolean } };
    [k: string]: unknown;
  }

  function HTMLtoDOCX(
    htmlString: string,
    headerHTMLString?: string | undefined,
    documentOptions?: DocxOptions,
    footerHTMLString?: string | undefined,
  ): Promise<Buffer | Blob>;

  export default HTMLtoDOCX;
}
