const ALWAYS_OPENERS = /^(BEGIN|CASE)$/i;
const CONDITIONAL_OPENERS = /^(IF|WHILE|FOR|LOOP|REPEAT)$/i;
const WORD_CHAR = /[A-Za-z0-9_]/;

// Strips leading whitespace and any leading line/block comments, returning
// whatever real SQL is left.
export function stripLeadingNoise(sql: string): string {
  let s = String(sql);
  let changed = true;
  while (changed) {
    changed = false;
    const trimmed = s.replace(/^\s+/, "");
    if (trimmed !== s) {
      s = trimmed;
      changed = true;
    }
    if (s.startsWith("--")) {
      const nl = s.indexOf("\n");
      s = nl === -1 ? "" : s.slice(nl + 1);
      changed = true;
    } else if (s.startsWith("/*")) {
      const end = s.indexOf("*/");
      s = end === -1 ? "" : s.slice(end + 2);
      changed = true;
    }
  }
  return s;
}

export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  const len = sql.length;
  let i = 0;

  while (i < len) {
    const ch = sql[i];
    const next = i + 1 < len ? sql[i + 1] : "";

    if (inLineComment) {
      current += ch;
      if (ch === "\n") inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      current += ch;
      if (ch === "*" && next === "/") {
        current += next;
        i += 2;
        inBlockComment = false;
        continue;
      }
      i++;
      continue;
    }
    if (inSingleQuote) {
      current += ch;
      if (ch === "'") {
        if (next === "'") {
          current += next;
          i += 2;
          continue;
        }
        inSingleQuote = false;
      }
      i++;
      continue;
    }
    if (inDoubleQuote) {
      current += ch;
      if (ch === '"') {
        if (next === '"') {
          current += next;
          i += 2;
          continue;
        }
        inDoubleQuote = false;
      }
      i++;
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      current += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inDoubleQuote = true;
      current += ch;
      i++;
      continue;
    }
    if (ch === "-" && next === "-") {
      inLineComment = true;
      current += ch;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      current += ch;
      i++;
      continue;
    }

    if (ch === ";") {
      if (depth > 0) {
        current += ch;
        i++;
        continue;
      }
      const trimmed = stripLeadingNoise(current).trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = "";
      i++;
      continue;
    }

    const prevChar = i > 0 ? sql[i - 1] : "";
    if (WORD_CHAR.test(ch) && !WORD_CHAR.test(prevChar)) {
      let j = i;
      while (j < len && WORD_CHAR.test(sql[j])) j++;
      const word = sql.slice(i, j);
      current += word;

      if (ALWAYS_OPENERS.test(word)) {
        depth++;
      } else if (CONDITIONAL_OPENERS.test(word) && depth > 0) {
        depth++;
      } else if (/^END$/i.test(word)) {
        if (depth > 0) depth--;
        let k = j;
        while (k < len && /\s/.test(sql[k])) k++;
        let wordEnd = k;
        while (wordEnd < len && WORD_CHAR.test(sql[wordEnd])) wordEnd++;
        const nextWord = sql.slice(k, wordEnd);
        if (/^(IF|WHILE|FOR|LOOP|REPEAT|CASE)$/i.test(nextWord)) {
          current += sql.slice(j, wordEnd);
          j = wordEnd;
        }
      }
      i = j;
      continue;
    }

    current += ch;
    i++;
  }

  const trimmed = stripLeadingNoise(current).trim();
  if (trimmed.length > 0) statements.push(trimmed);
  return statements;
}
