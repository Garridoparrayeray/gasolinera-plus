// @ts-check

const token = process.env.VERCEL_TOKEN;
const teamId = process.env.VERCEL_ORG_ID;

if (!token) {
  console.error('Error: Falta la variable de entorno VERCEL_TOKEN.');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json'
};

/**
 * @param {string} urlString
 */
async function fetchJson(urlString) {
  const res = await fetch(urlString, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Limpia los despliegues no utilizados de un proyecto concreto
 * @param {{ id: string, name: string, targets?: { production?: { id?: string } } }} project
 */
async function cleanProject(project) {
  const prodDeploymentId = project.targets?.production?.id;
  console.log(`\n------------------------------------------------------`);
  console.log(`Proyecto: ${project.name} (ID: ${project.id})`);
  console.log(`Produccion activa protegida: ${prodDeploymentId || 'No asignada especificamente'}`);

  let deleted = 0;
  let protectedCount = 0;
  let until;

  while (true) {
    const listUrl = new URL('https://api.vercel.com/v6/deployments');
    listUrl.searchParams.set('projectId', project.id);
    if (teamId) listUrl.searchParams.set('teamId', teamId);
    listUrl.searchParams.set('limit', '100');
    if (until) listUrl.searchParams.set('until', String(until));

    let data;
    try {
      data = await fetchJson(listUrl.toString());
    } catch (err) {
      console.error(`Error al listar despliegues de ${project.name}:`, err.message);
      break;
    }

    const deployments = data.deployments || [];
    if (deployments.length === 0) {
      break;
    }

    console.log(`Analizando lote de ${deployments.length} despliegues...`);

    for (const d of deployments) {
      const isProduction = (d.uid === prodDeploymentId) || (d.target === 'production');
      if (isProduction) {
        console.log(`  [PROTEGIDO] Produccion: ${d.uid} (${d.url})`);
        protectedCount++;
        continue;
      }

      console.log(`  [BORRANDO] Inactivo/Preview: ${d.uid} (${d.url})`);
      const delUrl = new URL(`https://api.vercel.com/v13/deployments/${d.uid}`);
      if (teamId) delUrl.searchParams.set('teamId', teamId);

      try {
        const delRes = await fetch(delUrl.toString(), {
          method: 'DELETE',
          headers
        });
        if (delRes.ok) {
          deleted++;
        } else {
          console.warn(`  No se pudo borrar ${d.uid}: HTTP ${delRes.status}`);
        }
      } catch (err) {
        console.warn(`  Error de red al borrar ${d.uid}:`, err);
      }
    }

    if (deployments.length < 100) {
      break;
    }
    until = deployments[deployments.length - 1].created;
  }

  console.log(`Resultado ${project.name}: ${deleted} borrados, ${protectedCount} protegidos.`);
  return { deleted, protectedCount };
}

async function main() {
  console.log('=== Limpieza de despliegues no utilizados en TODOS los proyectos de Vercel ===');

  // 1. Obtener la lista de todos los proyectos de la cuenta / equipo
  const projectsUrl = new URL('https://api.vercel.com/v9/projects');
  if (teamId) projectsUrl.searchParams.set('teamId', teamId);
  projectsUrl.searchParams.set('limit', '100');

  let projectsData;
  try {
    projectsData = await fetchJson(projectsUrl.toString());
  } catch (err) {
    console.error('Error al listar proyectos:', err.message);
    process.exit(1);
  }

  const projects = projectsData.projects || [];
  if (projects.length === 0) {
    console.log('No se encontraron proyectos en esta cuenta/equipo.');
    return;
  }

  console.log(`Se encontraron ${projects.length} proyectos: ${projects.map(p => p.name).join(', ')}`);

  let totalDeleted = 0;
  let totalProtected = 0;

  for (const project of projects) {
    const res = await cleanProject(project);
    totalDeleted += res.deleted;
    totalProtected += res.protectedCount;
  }

  console.log('\n======================================================');
  console.log('=== RESUMEN GLOBAL DE LIMPIEZA ===');
  console.log(`Proyectos analizados: ${projects.length}`);
  console.log(`Total despliegues borrados (inactivos / previews): ${totalDeleted}`);
  console.log(`Total despliegues de produccion protegidos: ${totalProtected}`);
  console.log('======================================================');
}

main().catch((err) => {
  console.error('Error fatal durante la ejecucion:', err);
  process.exit(1);
});
