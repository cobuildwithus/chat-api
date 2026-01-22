import { loadDatabaseConfig } from "../../config/env";
import { bootstrapCobuildDb } from "./create-cobuild-db";

const databaseConfig = loadDatabaseConfig();
const cobuildDb = bootstrapCobuildDb(databaseConfig);

export { cobuildDb };
