import { loadDatabaseConfig } from "../../config/env";
import { createCobuildDbResources } from "./create-cobuild-db";

const databaseConfig = loadDatabaseConfig();
const { db: cobuildDb, close: closeCobuildDb } = createCobuildDbResources(databaseConfig);

function cobuildPrimaryDb() {
  return cobuildDb.$primary ?? cobuildDb;
}

export { cobuildDb, cobuildPrimaryDb, closeCobuildDb };
