import assert from "node:assert/strict";
assert.equal(process.env.DATABASE_NAME, "icar_production_tracking_validation");
assert.equal(process.env.NOTIFICATION_WORKER_ENABLED, "false");
const base = "http://127.0.0.1:3000";
const suffix = Date.now().toString(36);
function session() {
  const cookies = new Map();
  return async (
    path,
    body,
    method = body === undefined ? "GET" : "POST",
    expected = body === undefined ? 200 : 201,
  ) => {
    const response = await fetch(base + path, {
      method,
      signal: AbortSignal.timeout(10000),
      headers: {
        cookie: [...cookies]
          .map(([key, value]) => `${key}=${value}`)
          .join("; "),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const index = pair.indexOf("=");
      cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const value = await response.json();
    assert.equal(
      response.status,
      expected,
      `${path}: ${JSON.stringify(value)}`,
    );
    return value;
  };
}
const admin = session();
await admin(
  "/api/auth/login",
  {
    identifier: process.env.INITIAL_ADMIN_EMAIL,
    password: process.env.INITIAL_ADMIN_PASSWORD,
  },
  "POST",
  200,
);
const roles = await admin("/api/roles");
const role = roles.find((role) => role.name === "PRODUCCION");
const line = await admin("/api/lineas-productivas", {
  name: `Seguimiento ${suffix}`,
});
const unit = await admin("/api/unidades", {
  name: `Unidad ${suffix}`,
  abbreviation: `T${suffix.slice(-5)}`,
  decimalScale: 0,
  kilogramFactor: 1,
});
const areas = [],
  presentations = [],
  clients = [];
for (let i = 0; i < 3; i++) {
  const category = await admin("/api/categorias", {
    name: `Categoría ${i} ${suffix}`,
  });
  const area = await admin("/api/production-areas", {
    name: `Área ${i} ${suffix}`,
    categoryIds: [category.id],
  });
  areas.push(area);
  const product = await admin("/api/productos", {
    name: `Producto ${i} ${suffix}`,
    categoryId: category.id,
    productLineId: line.id,
    baseUnitId: unit.id,
  });
  presentations.push(
    await admin(`/api/productos/${product.id}/presentaciones`, {
      unitId: unit.id,
      description: `Presentación ${i}`,
      conversionFactor: 1,
      weightKg: 1,
    }),
  );
  const username = `scope.${i}.${suffix}`;
  await admin("/api/usuarios", {
    name: `Responsable ${i} ${suffix}`,
    username,
    password: "Validacion123!",
    roleIds: [role.id],
    productionAreaIds: [area.id],
  });
  const client = session();
  await client(
    "/api/auth/login",
    { identifier: username, password: "Validacion123!" },
    "POST",
    200,
  );
  clients.push(client);
}
let request = await admin("/api/inventario/solicitudes-abastecimiento", {
  requiredDate: "2032-01-15",
});
request = await admin(
  `/api/inventario/solicitudes-abastecimiento/${request.id}`,
  {
    items: presentations
      .slice(0, 2)
      .map((presentation) => ({
        presentationId: presentation.id,
        additionalStockQuantity: 10,
      })),
  },
  "PATCH",
  200,
);
await admin(
  `/api/inventario/solicitudes-abastecimiento/${request.id}/enviar`,
  {},
);
let order = await admin("/api/production-consolidations", {
  deliveryDate: "2032-01-15",
  stockRequestId: request.id,
});
order = await admin(`/api/production-consolidations/${order.id}/emit`, {});
const first = order.details.find(
  (detail) => detail.productionAreaId === areas[0].id,
);
await admin(
  `/api/production-consolidations/${order.id}/details/${first.id}/start`,
  {},
);
await admin(
  `/api/production-consolidations/${order.id}/details/${first.id}/deliveries`,
  { quantity: 10, finalDelivery: true },
);
const path = `/api/production-consolidations/tracking?code=${order.code}`;
const whole = (await admin(path)).data[0];
assert.equal(whole.tracking.productCount, 2);
assert.equal(whole.tracking.producedPercent, 50);
assert.equal(whole.tracking.pendingReceiptCount, 1);
const a = (await clients[0](path)).data[0];
assert.equal(a.tracking.productCount, 1);
assert.equal(a.tracking.producedPercent, 100);
assert.equal(a.tracking.pendingReceiptCount, 1);
const b = (await clients[1](path)).data[0];
assert.equal(b.tracking.productCount, 1);
assert.equal(b.tracking.producedPercent, 0);
assert.equal(b.tracking.pendingReceiptCount, 0);
assert.equal((await clients[2](path)).meta.total, 0);
await clients[2](
  `/api/production-consolidations/${order.id}`,
  undefined,
  "GET",
  403,
);
for (let i = 0; i < 2; i++) {
  const detail = await clients[i](`/api/production-consolidations/${order.id}`);
  assert.equal(detail.details.length, 1);
  assert.equal(detail.details[0].productionAreaId, areas[i].id);
}
console.log(
  "PASS: orden compartida, porcentajes y entregas restringidos por área; área ajena sin listado ni detalle.",
);
