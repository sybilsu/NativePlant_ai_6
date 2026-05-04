const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
function readEnv() {
  try {
    return Object.fromEntries(fs.readFileSync(path.join(__dirname,'../../.env'),'utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
  } catch(e){return process.env;}
}
const ENV = readEnv();

const STYLE_EXTRACTION_PROMPT = `你是一位具備深度景觀設計與生態學知識的視覺分析師，專精於 Piet Oudolf 自然主義種植美學（Matrix Planting）。

分析上傳的景觀參考圖，以 JSON 格式回傳以下欄位（不含任何 markdown 標記或其他文字）：

{
  "role_distribution": {
    "matrix": <0-100整數，基質植物視覺比例>,
    "primary": <0-100整數，初級結構植物比例>,
    "scatter": <0-100整數，散布植物比例>,
    "filler": <0-100整數，填充地被比例>
  },
  "texture_tags": ["<質感語彙1>", "<質感語彙2>", "<質感語彙3>"],
  "height_layers": {
    "tree": <0-100，喬木層佔比>,
    "shrub": <0-100，灌木層佔比>,
    "grass": <0-100，草本層佔比>
  },
  "season_estimate": "<春季|夏季|秋季|冬季>",
  "identified_plants": [
    { "name_en": "<學名>", "name_zh": "<中文名>", "role": "<matrix|primary|scatter|filler>", "confidence": <0-1小數> }
  ],
  "dominant_colors": ["<hex色票1>", "<hex色票2>", "<hex色票3>"],
  "piet_aesthetic_tags": ["<Piet美學特徵1>", "...最多5個"],
  "foggy_score": <0-10整數，霧感/通透質感評分>,
  "winter_structure_score": <0-10整數，冬季骨幹結構評分>,
  "design_dna_summary": "<一句話描述整體設計DNA，繁體中文>"
}

role_distribution 四項合計必須為100。
texture_tags 選自：蓬鬆、透明、飄逸、直立、結構型、細密、粗獷、輕盈、霧感、骨幹型
piet_aesthetic_tags 選自：枯黃骨幹感、霧感通透、秋季穗序、冬季結構、自然野趣、草原美學、色彩漸層、動態飄逸`;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { imageBase64, mimeType = 'image/jpeg', siteConditions } = JSON.parse(event.body);

    if (!imageBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: '缺少圖片資料' }) };
    }

    const client = new OpenAI({ apiKey: ENV.OPENAI_API_KEY, baseURL: 'https://api.openai.com/v1' });

    const userText = siteConditions
      ? `基地條件：日照=${siteConditions.light}，水分=${siteConditions.moisture}，海拔=${siteConditions.altitude}m，面積=${siteConditions.area}㎡\n\n請分析這張景觀參考圖的設計DNA，輸出純 JSON。`
      : '請分析這張景觀參考圖的設計DNA，輸出純 JSON。';

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1024,
      messages: [
        {
          role: 'system',
          content: STYLE_EXTRACTION_PROMPT
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}` }
            },
            { type: 'text', text: userText }
          ]
        }
      ]
    });

    let rawContent = response.choices[0].message.content;
    rawContent = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const designDNA = JSON.parse(rawContent);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ designDNA })
    };
  } catch (err) {
    console.error('analyze-image error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || '圖片分析失敗' })
    };
  }
};
