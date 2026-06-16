const HADA_STATE_MARKER = "HADA_STATE::";

type HadaStateExtraction = {
  displayText: string;
  stateJson: string | null;
};

export function extractHadaState(content: string): HadaStateExtraction {
  let cursor = 0;
  let stateJson: string | null = null;
  const displayParts: string[] = [];

  while (cursor < content.length) {
    const markerIndex = content.toUpperCase().indexOf(HADA_STATE_MARKER, cursor);
    if (markerIndex === -1) {
      displayParts.push(content.slice(cursor));
      break;
    }

    displayParts.push(content.slice(cursor, markerIndex));

    let jsonStart = markerIndex + HADA_STATE_MARKER.length;
    while (jsonStart < content.length && /\s/.test(content[jsonStart] ?? "")) {
      jsonStart += 1;
    }

    if (content[jsonStart] !== "{") {
      const lineEnd = content.indexOf("\n", jsonStart);
      cursor = lineEnd === -1 ? content.length : lineEnd + 1;
      continue;
    }

    const jsonEnd = findJsonObjectEnd(content, jsonStart);
    if (jsonEnd === -1) {
      cursor = content.length;
      break;
    }

    stateJson = content.slice(jsonStart, jsonEnd + 1);
    cursor = jsonEnd + 1;
  }

  return {
    displayText: normalizeVisibleText(displayParts.join("")),
    stateJson
  };
}

export function stripHadaState(content: string) {
  return extractHadaState(content).displayText;
}

function normalizeVisibleText(value: string) {
  return value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findJsonObjectEnd(value: string, start: number) {
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}
