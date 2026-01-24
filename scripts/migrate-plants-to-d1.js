import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// 自动查找数据库路径
const D1_DIR = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const JSON_PATH = "plants.json";

function getDbPath() {
    if (!fs.existsSync(D1_DIR)) return null;
    const files = fs.readdirSync(D1_DIR);
    const dbFile = files.find(f => f.endsWith(".sqlite"));
    return dbFile ? path.join(D1_DIR, dbFile) : null;
}

async function migrate() {
    const DB_PATH = getDbPath();

    if (!fs.existsSync(JSON_PATH)) {
        console.error(`Error: ${JSON_PATH} not found.`);
        return;
    }

    if (!DB_PATH || !fs.existsSync(DB_PATH)) {
        console.error(`Error: Local D1 database not found in ${D1_DIR}. Make sure to run 'npm run dev' or 'wrangler d1 execute ... --local' first.`);
        return;
    }

    console.log(`Found database at: ${DB_PATH}`);
    const db = new Database(DB_PATH);
    const plants = JSON.parse(fs.readFileSync(JSON_PATH, "utf-8"));

    console.log(`Starting migration of ${plants.length} plants...`);

    const insert = db.prepare(`
        INSERT OR REPLACE INTO plants (
            id, name, category, care_difficulty, 
            basic_info, ornamental_features, care_guide
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertSynonym = db.prepare(`
        INSERT OR REPLACE INTO plant_synonyms (plant_id, synonym)
        VALUES (?, ?)
    `);

    let count = 0;
    const transaction = db.transaction((data) => {
        for (const plant of data) {
            insert.run(
                plant.id,
                plant.basicInfo?.name || "未知",
                plant.ornamentalFeatures?.category || null,
                plant.careGuide?.careDifficulty || null,
                JSON.stringify(plant.basicInfo || {}),
                JSON.stringify(plant.ornamentalFeatures || {}),
                JSON.stringify(plant.careGuide || {})
            );

            // 插入别名
            if (plant.basicInfo?.synonyms && Array.isArray(plant.basicInfo.synonyms)) {
                for (const synonym of plant.basicInfo.synonyms) {
                    if (synonym && synonym.trim()) {
                        insertSynonym.run(plant.id, synonym.trim());
                    }
                }
            }
            count++;
        }
    });

    try {
        transaction(plants);
        console.log(`Successfully migrated ${count} plants to D1.`);
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        db.close();
    }
}

migrate();
