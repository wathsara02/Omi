import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** WCAG 2.2 at levels A and AA, which is what the design was drawn to. */
const RULE_SETS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * Runs the automated accessibility rules over the page as it stands. Automated
 * rules find perhaps a third of real problems (contrast, names, roles); they
 * say nothing about whether the game can be followed by ear.
 */
export const expectAccessible = async (page: Page, name: string): Promise<void> => {
  const { violations, passes } = await new AxeBuilder({ page }).withTags(RULE_SETS).analyze();
  // A scan that checked nothing would otherwise look like a clean one.
  expect(passes.length, `${name}: accessibility rules that ran`).toBeGreaterThan(0);
  const found = violations.map((violation) => {
    const where = violation.nodes.map((node) => node.target.join(' ')).join(', ');
    return `${violation.id}: ${violation.help} [${where}]`;
  });
  expect(found, `${name}: accessibility problems`).toEqual([]);
};
