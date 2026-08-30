const TEST_PATH =
  /(?:^|\/)(?:__tests__|tests?|spec)(?:\/|$)|(?:\.(?:test|spec)\.[^/]+|_test\.go|test_[^/]+\.py|tests?\.rs)$/i;

function isTestPath(path: string): boolean {
  return TEST_PATH.test(path);
}

export type ProofPlanKind =
  | "none"
  | "docs_only"
  | "source"
  | "source+test"
  | "test"
  | "boundary";

export interface ChangeFacts {
  files: readonly string[];
  /** Existing suite usable for counterfactual when no test file changed. */
  hasExistingTests?: boolean;
}

export interface ProofCheckPlan {
  selected: boolean;
  reason: string;
}

export interface ProofPlan {
  kind: ProofPlanKind;
  testFiles: string[];
  standard: ProofCheckPlan;
  counterfactual: ProofCheckPlan;
}

const DOCUMENTATION_PATH =
  /(?:^|\/)(?:docs?|documentation)(?:\/|$)|(?:^|\/)(?:readme|changelog|license)(?:\.[^/]+)?$/i;
const DOCUMENTATION_EXTENSION = /\.(?:md|mdx|rst|adoc|txt)$/i;
const BOUNDARY_PATH =
  /(?:^|\/)(?:package(?:-lock)?\.json|npm-shrinkwrap\.json|(?:pnpm-lock|yarn\.lock|bun\.lockb?|cargo\.lock|go\.(?:mod|sum))|pyproject\.toml|cargo\.toml|tsconfig(?:\.[^/]+)?\.json|jsconfig(?:\.[^/]+)?\.json|biome\.json(?:c)?|\.eslintrc(?:\.[^/]+)?|jest\.config\.[^/]+|vitest\.config\.[^/]+|Makefile|Dockerfile)$/i;

function normalisePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function isDocumentationPath(path: string): boolean {
  return DOCUMENTATION_PATH.test(path) || DOCUMENTATION_EXTENSION.test(path);
}

function isBoundaryPath(path: string): boolean {
  return BOUNDARY_PATH.test(path);
}

export function planProof(changeFacts: ChangeFacts): ProofPlan {
  const files = [...new Set(changeFacts.files.map(normalisePath))].sort((left, right) =>
    left.localeCompare(right),
  );
  const testFiles = files.filter(isTestPath);
  const hasChangedTests = testFiles.length > 0;
  const hasTests = hasChangedTests || changeFacts.hasExistingTests === true;
  const hasSource = files.some(
    (file) => !isDocumentationPath(file) && !isBoundaryPath(file) && !isTestPath(file),
  );
  const hasBoundary = files.some(isBoundaryPath);
  const allDocumentation = files.length > 0 && files.every(isDocumentationPath);

  let kind: ProofPlanKind = "none";
  if (allDocumentation) kind = "docs_only";
  else if (hasSource && hasChangedTests) kind = "source+test";
  else if (hasSource) kind = "source";
  else if (hasChangedTests) kind = "test";
  else if (hasBoundary) kind = "boundary";

  const standardSelected = kind !== "none" && kind !== "docs_only";
  const counterfactualSelected = kind !== "none" && kind !== "docs_only" && hasTests;

  let standardReason = "no repository files changed";
  if (standardSelected)
    standardReason = "source, test, or verification-boundary files changed";
  else if (kind === "docs_only") standardReason = "documentation-only change";

  let counterfactualReason = "no test change or existing test suite";
  if (counterfactualSelected) {
    counterfactualReason = hasChangedTests
      ? "a test file changed"
      : "an existing test suite is available";
  }

  return {
    kind,
    testFiles,
    standard: {
      selected: standardSelected,
      reason: standardReason,
    },
    counterfactual: {
      selected: counterfactualSelected,
      reason: counterfactualReason,
    },
  };
}
