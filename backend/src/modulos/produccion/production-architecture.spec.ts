import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const base = path.resolve('src/modulos/produccion');
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
  );
}
describe('límites arquitectónicos de Producción', () => {
  for (const layer of ['aplicacion', 'dominio']) {
    it(`${layer} conserva contratos propios sin dependencias externas de ejecución`, () => {
      const violations: string[] = [];
      for (const file of files(path.join(base, layer)).filter(
        (file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'),
      )) {
        const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
        for (const node of source.statements) {
          if (
            !(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ||
            !node.moduleSpecifier ||
            !ts.isStringLiteral(node.moduleSpecifier)
          )
            continue;
          const dependency = node.moduleSpecifier.text;
          if (
            !dependency.startsWith('.') ||
            /(?:infraestructura|presentacion|entidades|\/dto\/)/.test(dependency) ||
            (layer === 'dominio' && dependency.includes('aplicacion'))
          )
            violations.push(`${path.relative(base, file)} -> ${dependency}`);
        }
      }
      expect(violations).toEqual([]);
    });
  }
});
