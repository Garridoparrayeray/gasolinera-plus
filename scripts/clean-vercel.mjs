// @ts-check

const token = process.env.VERCEL_TOKEN;
const teamId = process.env.VERCEL_ORG_ID;
const projectId = process.env.VERCEL_PROJECT_ID;

if (!token || !projectId) {
  console.error('Error: Faltan variables de entorno requeridas (VERCEL_TOKEN, VERCEL_PROJECT_ID).');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json'
};

async function main() {
  console.log('=== Limpieza de despliegues no utilizados en Vercel ===');

  // 1. Obtener detalles del proyecto y el ID de despliegue de produccion activo
  const projectUrl = new URL(`https://api.vercel.com/v9/projects/${projectId}`);
  if (teamId) projectUrl.searchParams.set('teamId', teamId);

  const projRes = await fetch(projectUrl.toString(), { headers });
  if (!projRes.ok) {
    console.error(`Error al consultar el proyecto: ${projRes.status} ${projRes.statusText}`);
    const text = await projRes.text();
    console.error(text);
    process.exit(1);
  }

  const project = await projRes.json();
  const prodDeploymentId = project.targets?.production?.id;
  console.log(`Proyecto: ${project.name} (${project.id})`);
  console.log(`Despliegue de produccion activo: ${prodDeploymentId || 'No detectado especificamente'}`);

  // 2. Paginar y recorrer todos los despliegues
  let deletedCount = 0;
  let skippedCount = 0;
  let until;

  while (true) {
    const listUrl = new URL('https://api.vercel.com/v6/deployments');
    listUrl.searchParams.set('projectId', projectId);
    if (teamId) listUrl.searchParams.set('teamId', teamId);
    listUrl.searchParams.set('limit', '100');
    if (until) listUrl.searchParams.set('until', String(until));

    const listRes = await fetch(listUrl.toString(), { headers });
    if (!listRes.ok) {
      console.error(`Error al listar despliegues: ${listRes.status}`);
      break;
    }

    const data = await listRes.json();
    const deployments = data.deployments || [];
    if (deployments.length === 0) {
      break;
    }

    console.log(`Analizando lote de ${deployments.length} despliegues...`);

    for (const d of deployments) {
      const isProduction = (d.uid === prodDeploymentId) || (d.target === 'production');
      if (isProduction) {
        console.log(`[PROTEGIDO] Produccion: ${d.uid} (${d.url})`);
        skippedCount++;
        continue;
      }

      console.log(`[BORRANDO] Preview/Antiguo: ${d.uid} (${d.url})`);
      const delUrl = new URL(`https://api.vercel.com/v13/deployments/${d.uid}`);
      if (teamId) delUrl.searchParams.set('teamId', teamId);

      try {
        const delRes = await fetch(delUrl.toString(), {
          method: 'DELETE',
          headers
        });
        if (delRes.ok) {
          deletedCount++;
        } else {
          console.warn(`No se pudo borrar ${d.uid}: status ${delRes.status}`);
        }
      } catch (err) {
        console.warn(`Error de red al borrar ${d.uid}:`, err);
      }
    }

    if (deployments.length < 100) {
      break;
    }
    until = deployments[deployments.length - 1].created;
  }

  console.log('======================================================');
  console.log(`Limpieza finalizada con exito:`);
  console.log(` - Despliegues borrados: ${deletedCount}`);
  console.log(` - Despliegues de produccion protegidos: ${skippedCount}`);
}

main().catch((err) => {
  console.error('Error fatal durante la ejecucion:', err);
  process.exit(1);
});
