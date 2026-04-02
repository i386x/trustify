import { type InspectColor, styleText } from "node:util";
import { scriptName } from "./utils.js";

const CODE_DEFAULT = "cyan";
const COMMENT_DEFAULT = "yellow";
const ESC = "\u001b";
const MIN_TERM_LENGTH = 3;
const SECTION_DEFAULT = "bold";
const TERM_DEFAULT = "magenta";
const WARNING = "WARNING:";
const WARNING_DEFAULT = "yellowBright";

type StyleProperty = InspectColor | readonly InspectColor[];

interface Style {
  comment?: StyleProperty;
  code?: StyleProperty;
  term?: StyleProperty;
  warning?: StyleProperty;
  section?: StyleProperty;
}

interface Formatter {
  format(style: Style): string;
}

class Chunk {
  protected content: string;

  constructor(content: string) {
    this.content = content;
  }
}

class Comment extends Chunk implements Formatter {
  format(style: Style): string {
    return styleText(style.comment ?? COMMENT_DEFAULT, this.content);
  }
}

class Code extends Chunk implements Formatter {
  format(style: Style): string {
    return styleText(style.code ?? CODE_DEFAULT, this.content);
  }
}

class Usage extends Code {
  constructor(content: string) {
    super(content.replace(/^%(?:prog|script)\b/u, scriptName()));
  }
}

class Term extends Chunk implements Formatter {
  format(style: Style): string {
    return styleText(style.term ?? TERM_DEFAULT, this.content);
  }
}

class QuotedTerm extends Term {
  override format(style: Style): string {
    let output = super.format(style);

    if (!output.includes(ESC))
      output = `\`${output}\``;
    return output;
  }
}

class Warning extends Chunk implements Formatter {
  constructor() {
    super(WARNING);
  }

  format(style: Style): string {
    return styleText(style.warning ?? WARNING_DEFAULT, this.content);
  }
}

class Section extends Chunk implements Formatter {
  format(style: Style): string {
    return styleText(style.section ?? SECTION_DEFAULT, this.content);
  }
}

type Fragment = string | Formatter;

class Line implements Formatter {
  protected fragments: Fragment[];

  constructor(...fragments: Fragment[]) {
    this.fragments = fragments;
  }

  format(style: Style): string {
    let output = "";

    this.fragments.forEach((fragment) => {
      if (typeof fragment === "string")
        output += fragment;
      else
        output += fragment.format(style);
    });
    return output;
  }
}

function fragmentize(content: string): Fragment[] {
  return content.split(/(?<term><[^>]+>|`[^`]+`)/u).map((part) => {
    if (part.length >= MIN_TERM_LENGTH) {
      if (part.startsWith("<") && part.endsWith(">"))
        return new Term(part);
      else if (part.startsWith("`") && part.endsWith("`"))
        return new QuotedTerm(part.slice(1, part.length - 1));
      return part;
    }
    return part;
  });
}

type CodeBlockItem = string | string[];

export class HelpFormatter implements Formatter {
  protected lines: Formatter[];

  constructor() {
    this.lines = [];
  }

  blankLine(): void {
    this.lines.push(new Line());
  }

  usage(content: string): this {
    this.lines.push(new Line("Usage: ", new Usage(content)));
    this.blankLine();
    return this;
  }

  par(...content: string[]): this {
    if (content.length === 0)
      return this;
    content.forEach((item) => {
      this.lines.push(new Line(...fragmentize(item)));
    });
    this.blankLine();
    return this;
  }

  codeblock(...content: CodeBlockItem[]): this {
    if (content.length === 0)
      return this;
    content.forEach((item) => {
      const chunk = (typeof item === "string") ? item : item.join(" ");

      if (chunk.startsWith("#"))
        this.lines.push(new Line("  ", new Comment(chunk)));
      else
        this.lines.push(new Line("  ", new Code(chunk)));
    });
    this.blankLine();
    return this;
  }

  warning(...content: string[]): this {
    if (content.length === 0)
      return this;

    let cnt = 0;
    content.forEach((item) => {
      const fragments: Fragment[] = [];

      fragments.push(
        (cnt === 0) ? new Warning() : " ".repeat(WARNING.length), " ",
      );
      fragments.push(...fragmentize(item));
      this.lines.push(new Line(...fragments));
      cnt += 1;
    });
    this.blankLine();
    return this;
  }

  section(content: string): this {
    this.lines.push(new Section(content));
    this.blankLine();
    return this;
  }

  term(name: string, ...description: string[]): this {
    const nameFragments = fragmentize(name);

    if (nameFragments.length === 1 && typeof nameFragments[0] === "string")
      nameFragments[0] = new Term(nameFragments[0]);
    this.lines.push(new Line("  ", ...nameFragments));

    description.forEach((item) => {
      this.lines.push(new Line("    ", ...fragmentize(item)));
    });
    this.blankLine();
    return this;
  }

  format(style: Style): string {
    let output = "";

    this.lines.forEach((line) => {
      output = `${output}${line.format(style)}\n`;
    });
    return output;
  }
}
