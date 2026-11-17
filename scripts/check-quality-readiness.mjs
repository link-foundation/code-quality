#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const requiredCapabilities = Object.freeze([
  'language-structure',
  'cli-library',
  'http-container',
  'extensions',
  'evolution',
  'shell-pipeline',
  'language-semantics',
  'competitor-parity',
  'closed-source-cases',
  'quality-bash-parity',
]);

function checkEntries(inventory, strict, exists) {
  const errors = [];
  const ids = new Set();
  for (const entry of [
    ...inventory.capabilities,
    ...inventory.nativeAdapters,
  ]) {
    if (!entry.id || ids.has(entry.id)) {
      errors.push(`Missing or duplicate capability id: ${entry.id}`);
    }
    ids.add(entry.id);
    if (!['native', 'partial', 'missing', 'carried'].includes(entry.status)) {
      errors.push(`Invalid status: ${entry.id}`);
    }
    const evidence = Array.isArray(entry.evidence)
      ? entry.evidence
      : [entry.evidence];
    if (
      !evidence.length ||
      evidence.some((path) => typeof path !== 'string' || !exists(path))
    ) {
      errors.push(`Missing evidence: ${entry.id}`);
    }
    if (strict && entry.status !== 'native') {
      errors.push(`Not ready: ${entry.id} (${entry.status})`);
    }
  }
  return errors;
}

function missingRequirements(inventory) {
  const errors = [];
  for (const id of requiredCapabilities) {
    if (
      !inventory.capabilities.some(
        (entry) => entry.id === id && entry.required === true
      )
    ) {
      errors.push(`Missing required capability: ${id}`);
    }
  }
  return errors;
}

export function checkReadiness(
  inventory,
  { strict = false, exists = existsSync } = {}
) {
  const errors = [];
  if (
    inventory?.schemaVersion !== 1 ||
    !Array.isArray(inventory.capabilities) ||
    !Array.isArray(inventory.nativeAdapters)
  ) {
    return { passed: false, errors: ['Invalid readiness inventory'] };
  }
  errors.push(...checkEntries(inventory, strict, exists));
  errors.push(...missingRequirements(inventory));
  if (
    strict &&
    [
      inventory.translation?.carriedBehavior,
      inventory.translation?.unsupported,
    ].some((items) => items?.length)
  ) {
    errors.push('Unsupported or carried behavior remains');
  }
  return { passed: errors.length === 0, errors };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const inventory = JSON.parse(
      await readFile('docs/case-studies/issue-1/readiness.json', 'utf8')
    );
    const result = checkReadiness(inventory, {
      strict: process.argv.includes('--strict'),
    });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.passed ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
