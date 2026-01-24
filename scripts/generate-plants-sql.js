import fs from "fs";

const JSON_PATH = "plants.json";
const OUTPUT_PATH = "sql/plants_data.sql";

function escapeSql(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/'/g, "''");
}

function generateSql() {
    if (!fs.existsSync(JSON_PATH)) {
        console.error(`Error: ${JSON_PATH} not found.`);
        return;
    }

    const plants = JSON.parse(fs.readFileSync(JSON_PATH, "utf-8"));
    console.log(`Generating SQL for ${plants.length} plants...`);

    // Use a Set to track unique IDs (plants.json has duplicates)
    const processedIds = new Set();
    const sqlStatements = [];

    sqlStatements.push("-- 自动生成的植物数据导入脚本");

    for (const plant of plants) {
        if (processedIds.has(plant.id)) continue;
        processedIds.add(plant.id);

        const id = escapeSql(plant.id);
        const name = escapeSql(plant.basicInfo?.name || "未知");
        const category = escapeSql(plant.ornamentalFeatures?.category || "");
        const difficulty = escapeSql(plant.careGuide?.careDifficulty || "");

        const basicInfo = escapeSql(JSON.stringify(plant.basicInfo || {}));
        const features = escapeSql(JSON.stringify(plant.ornamentalFeatures || {}));
        const careGuide = escapeSql(JSON.stringify(plant.careGuide || {}));

        sqlStatements.push(`INSERT OR REPLACE INTO plants (id, name, category, care_difficulty, basic_info, ornamental_features, care_guide) VALUES ('${id}', '${name}', '${category}', '${difficulty}', '${basicInfo}', '${features}', '${careGuide}');`);

        // 添加别名数据
        if (plant.basicInfo?.synonyms && Array.isArray(plant.basicInfo.synonyms)) {
            for (const synonym of plant.basicInfo.synonyms) {
                if (synonym && synonym.trim()) {
                    const escapedSynonym = escapeSql(synonym.trim());
                    sqlStatements.push(`INSERT OR REPLACE INTO plant_synonyms (plant_id, synonym) VALUES ('${id}', '${escapedSynonym}');`);
                }
            }
        }
    }

    fs.writeFileSync(OUTPUT_PATH, sqlStatements.join("\n"), "utf-8");
    console.log(`Successfully generated ${OUTPUT_PATH} with ${processedIds.size} unique records.`);
}

generateSql();
