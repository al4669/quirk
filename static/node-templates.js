// Predefined node templates for quick insertion and user-defined extensions
class NodeTemplates {
  static storageKey = 'quirk-node-templates';

  static getDefaultTemplates() {
    return [
      {
        title: 'Note',
        isSystem: true,
        nodeType: 'markdown',
        contentType: 'markdown',
        description: 'Blank markdown note with a starter heading.',
        content: '# New Note\n\nAdd your thoughts here…'
      },
      {
        title: 'Task List',
        isSystem: true,
        nodeType: 'markdown',
        contentType: 'markdown',
        description: 'Checklist with owners, due dates, and status.',
        content: `# Task List\n\n- [ ] Owner: ___ | Due: ___ | Status: Not started\n- [ ] Owner: ___ | Due: ___ | Status: In progress\n- [ ] Owner: ___ | Due: ___ | Status: Review\n\n## Notes\n- Priority:\n- Blockers:\n`
      },
      {
        title: 'Decision',
        isSystem: true,
        nodeType: 'markdown',
        contentType: 'markdown',
        description: 'Pros/cons, options, and decision outcome.',
        content: `# Decision\n\n## Context\n- What are we deciding?\n- Who is accountable?\n\n## Options\n1. Option A — pros/cons\n2. Option B — pros/cons\n\n## Decision\n- Chosen option:\n- Rationale:\n- Date:\n`
      },
      {
        title: 'Meeting Notes',
        isSystem: true,
        nodeType: 'markdown',
        contentType: 'markdown',
        description: 'Agenda, attendees, and action items.',
        content: `# Meeting Notes\n\n**Date:** \n**Attendees:** \n**Goal:** \n\n## Agenda\n1. \n2. \n\n## Notes\n- \n\n## Actions\n- [ ] Owner — Action — Due\n`
      },
      {
        title: 'Bug Report',
        isSystem: true,
        nodeType: 'markdown',
        contentType: 'markdown',
        description: 'Repro steps, expected vs actual, environment.',
        content: `# Bug Report\n\n**Title:** \n**Severity:** Low / Med / High / Critical\n**Environment:** Prod / Staging / Dev\n\n## Steps to Reproduce\n1. \n2. \n3. \n\n## Expected\n- \n\n## Actual\n- \n\n## Attachments / Logs\n- \n`
      },
      {
        title: 'API Note',
        isSystem: true,
        nodeType: 'markdown',
        contentType: 'markdown',
        description: 'Describe an endpoint or integration contract.',
        content: `# API Note\n\n**Endpoint:** \n**Method:** GET | POST | PUT | DELETE\n**Description:** \n\n## Request\n\`\`\`json\n{\n  \"\": \"\"\n}\n\`\`\`\n\n## Response\n\`\`\`json\n{\n  \"\": \"\"\n}\n\`\`\`\n\n## Notes\n- Auth:\n- Rate limits:\n- Owners:\n`
      },
      {
        title: 'JS Script',
        isSystem: true,
        nodeType: 'script',
        contentType: 'code',
        description: 'Run a JavaScript snippet (no need to wrap in fences).',
        content: `function main() {\n  console.log('Hello from script node');\n}\n\nmain();`
      },
      {
        title: 'Save Output',
        isSystem: true,
        nodeType: 'system',
        contentType: 'markdown',
        description: 'Save the previous node\'s output. Uses fenced language for file type, otherwise saves as markdown.',
        content: `Connect this node downstream of the output you want to persist.\nWhen executed it downloads the upstream result:\n- If the text is inside a fenced block (e.g. \\\`\\\`\\\`js …\\\`\\\`\\\`), the fence language becomes the file extension.\n- Otherwise the content is saved as markdown.`
      },
      {
        title: 'Instruction',
        isSystem: true,
        nodeType: 'instruction',
        contentType: 'markdown',
        description: 'Instructional node with markdown content.',
        content: `# Instruction\n\n- Goal:\n- Audience:\n- Steps:\n`
      },
      {
        title: 'Image',
        isSystem: true,
        nodeType: 'image',
        contentType: 'markdown',
        description: 'Generate an image from a short prompt.',
        content: `A serene landscape with mountains, a lake, and warm sunrise lighting.`
      },
      {
        title: 'HTML Preview',
        isSystem: true,
        nodeType: 'html-preview',
        contentType: 'markdown',
        description: 'Render sanitized HTML inline or fullscreen (no scripts).',
        content: `# HTML Preview\n\nPaste HTML directly, or wrap it:\n\n\`\`\`html\n<div class="card">Hello</div>\n<style>\n  .card { padding: 16px; border-radius: 8px; background: #10131a; color: #fff; }\n</style>\n\`\`\`\n\nScripts are stripped; inline styles are allowed.`
      },
      {
        title: 'Code Snippet',
        isSystem: true,
        nodeType: 'script',
        contentType: 'code',
        description: 'Share code with context and usage notes.',
        content: `function example() {\n  return 'Hello, world';\n}\n`
      },
      {
        title: 'Idea',
        isSystem: true,
        nodeType: 'markdown',
        contentType: 'markdown',
        description: 'Quick capture for brainstorming.',
        content: `# Idea\n\n## Summary\n- \n\n## Why now?\n- \n\n## Next steps\n- \n`
      },
      {
        title: 'Research',
        isSystem: true,
        nodeType: 'markdown',
        contentType: 'markdown',
        description: 'Questions, sources, findings, and conclusions.',
        content: `# Research Notes\n\n## Question\n- \n\n## Sources\n- \n\n## Findings\n- \n\n## Conclusion\n- \n`
      },
      {
        title: 'Prompt',
        isSystem: true,
        nodeType: 'instruction',
        contentType: 'markdown',
        description: 'Store prompts for AI or brainstorming.',
        content: `# Prompt\n\n**Role:** \n**Goal:** \n**Instructions:**\n- \n- \n\n**Examples:**\n- \n`
      }
    ];
  }

  static getUserTemplates() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch (err) {
      console.warn('[NodeTemplates] Failed to parse user templates', err);
      return [];
    }
  }

  static saveUserTemplates(list) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(list || []));
    } catch (err) {
      console.warn('[NodeTemplates] Failed to save user templates', err);
    }
  }

  static getTemplates() {
    return [...this.getDefaultTemplates(), ...this.getUserTemplates()];
  }
}
