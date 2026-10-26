/**
 * Script to run match ingestion
 */

import dotenv from "dotenv";
dotenv.config();

import { runFullIngestion } from "../workers/match-ingestion";

runFullIngestion()
  .then(() => {
    console.log("Ingestion completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Ingestion failed:", error);
    process.exit(1);
  });
