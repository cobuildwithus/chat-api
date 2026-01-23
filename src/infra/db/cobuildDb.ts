import { loadDatabaseConfig } from "../../config/env";
import { createCobuildDbResources } from "./create-cobuild-db";

const databaseConfig = loadDatabaseConfig();
const { db: cobuildDb, close: closeCobuildDb } = createCobuildDbResources(databaseConfig);

export { cobuildDb, closeCobuildDb };
