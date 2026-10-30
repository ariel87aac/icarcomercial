import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const limite = 300;
const extensiones = new Set(['.ts', '.html', '.scss', '.css']);
const fuentes = [path.join(raiz, 'backend', 'src'), path.join(raiz, 'frontend', 'src')];

function archivos(directorio) {
  return fs.readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
    const destino = path.join(directorio, entrada.name);
    if (entrada.isDirectory()) {
      const relativo = path.relative(raiz, destino).split(path.sep).join('/');
      if (relativo === 'backend/src/base-datos/migraciones') return [];
      return archivos(destino);
    }
    return extensiones.has(path.extname(entrada.name)) ? [destino] : [];
  });
}

const resultados = fuentes.flatMap(archivos).map((archivo) => ({
  archivo,
  lineas: fs.readFileSync(archivo, 'utf8').split(/\r?\n/).length,
}));
const excedidos = resultados.filter(({ lineas }) => lineas > limite).sort((a, b) => b.lineas - a.lineas);

if (excedidos.length) {
  console.error(`Se encontraron ${excedidos.length} archivos que superan ${limite} líneas:`);
  for (const item of excedidos) {
    console.error(`- ${path.relative(raiz, item.archivo)}: ${item.lineas}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Control aprobado: ${resultados.length} archivos activos tienen como máximo ${limite} líneas.`);
  console.log('Excepción controlada: las migraciones históricas no se modifican ni se contabilizan.');
}
