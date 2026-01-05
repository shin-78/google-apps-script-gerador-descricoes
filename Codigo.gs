// ===============================================
// 🔐 CONFIGURAÇÃO GROQ
// ===============================================
const GROQ_API_KEY = "SUA_CHAVE_API";
const GROQ_MODEL = "meta-llama/llama-4-maverick-17b-128e-instruct";

// ===============================================
// 🚀 FUNÇÃO PRINCIPAL
// ===============================================
function gerarDescricoesGroq() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Produtos");
  const sheetInstrucao = ss.getSheetByName("Instrução");
  const promptBase = sheetInstrucao.getRange("Z1").getValue();
  const logSheet = getOrCreateLogSheet(ss);
  const lastRow = sheet.getLastRow();

  const batchSize = 3;
  const delay = 2000; // 🔥 Limite para 30 req/min
  const progressoCell = sheetInstrucao.getRange("Z2");
  const ultimaLinha = progressoCell.getValue() || 2;

  logEvent(logSheet, "🚀 Início da execução", "");
  let errosSeguidos = 0;

  for (let start = ultimaLinha; start <= lastRow; start += batchSize) {
    const end = Math.min(start + batchSize - 1, lastRow);
    const dados = sheet.getRange(`A${start}:B${end}`).getValues();

    for (let i = 0; i < dados.length; i++) {
      const [titulo, base] = dados[i];
      const linhaAtual = start + i;

      if (!titulo || !base) continue;

      const prompt = `${promptBase}\n\nProduto: ${titulo}\nBaseie-se nesta descrição antiga: ${base}`;

      try {
        const resposta = chamarGroqComRetry(prompt, 6, linhaAtual, logSheet);
        sheet.getRange(linhaAtual, 3).setValue(resposta);
        logEvent(logSheet, "✅ Sucesso", `Linha ${linhaAtual} - ${titulo}`);
        errosSeguidos = 0;

      } catch (err) {
        const msg = err.message || "";
        sheet.getRange(linhaAtual, 3).setValue("Erro: " + msg);
        logEvent(logSheet, "❌ Erro final", `Linha ${linhaAtual} - ${msg}`);

        // Se forem muitos erros 429, pausa automática
        if (msg.includes("429") || msg.includes("rate_limit")) {
          errosSeguidos++;
          if (errosSeguidos >= 3) {
            logEvent(logSheet, "⏸️ Pausa", "Muitos erros 429. Aguardando 60s...");
            Utilities.sleep(60000);
            errosSeguidos = 0;
          }
        }
      }

      // ⏱️ Delay para respeitar 30 req/min
      Utilities.sleep(delay);
    }

    progressoCell.setValue(end + 1);
  }

  logEvent(logSheet, "🏁 Fim da execução", "");
  SpreadsheetApp.getUi().alert("Execução concluída! Veja a aba Logs.");
}

// ===============================================
// 🔄 RETRY AUTOMÁTICO (inclui erro 500 agora)
// ===============================================
function chamarGroqComRetry(prompt, tentativasMax, linhaAtual, logSheet) {
  let espera = 4000;

  for (let tentativa = 0; tentativa < tentativasMax; tentativa++) {
    try {
      logEvent(logSheet, "🔄 Tentando", `Linha ${linhaAtual} - Tentativa ${tentativa + 1}`);
      return chamarGroq(prompt);

    } catch (err) {
      const msg = err.message || "";

      const precisaRetry =
        msg.includes("429") ||
        msg.includes("500") ||
        msg.includes("timeout") ||
        msg.includes("overloaded") ||
        msg.includes("rate_limit");

      if (precisaRetry) {
        const jitter = Math.random() * 1500;
        const esperaFinal = espera + jitter;

        logEvent(
          logSheet,
          "⚠️ Retry",
          `Linha ${linhaAtual} - Esperando ${(esperaFinal / 1000).toFixed(1)}s - Motivo: ${msg}`
        );

        Utilities.sleep(esperaFinal);
        espera *= 2;
      } else {
        throw err;
      }
    }
  }

  throw new Error("Falhou após múltiplas tentativas.");
}

// ===============================================
// 🧠 CHAMADA AO MODELO GROQ COM ERROS DETALHADOS
// ===============================================
function chamarGroq(prompt) {
  const url = "https://api.groq.com/openai/v1/chat/completions";

  const payload = {
    model: GROQ_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
    max_tokens: 900
  };

  const options = {
    method: "post",
    headers: {
      Authorization: "Bearer " + GROQ_API_KEY,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  const body = response.getContentText();

  if (code >= 200 && code < 300) {
    const json = JSON.parse(body);
    return json.choices?.[0]?.message?.content?.trim() || "(sem retorno)";
  }

  // 🔥 Tratamento detalhado do erro
  let mensagem = "Erro HTTP " + code;

  try {
    const jsonErr = JSON.parse(body);
    if (jsonErr.error?.message) {
      mensagem += " - " + jsonErr.error.message;
    } else {
      mensagem += " - " + body;
    }
  } catch (e) {
    mensagem += " - " + body;
  }

  throw new Error(mensagem);
}

// ===============================================
// 📄 LOGS
// ===============================================
function getOrCreateLogSheet(ss) {
  let logSheet = ss.getSheetByName("Logs");
  if (!logSheet) {
    logSheet = ss.insertSheet("Logs");
    logSheet.appendRow(["Data/Hora", "Evento", "Detalhes"]);
  }
  return logSheet;
}

function logEvent(sheet, evento, detalhes) {
  const agora = new Date();
  sheet.appendRow([
    Utilities.formatDate(agora, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"),
    evento,
    detalhes
  ]);
}

// ===============================================
// 🟢 MENU
// ===============================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("PDP Automação 💚")
    .addItem("Gerar descrições (GROQ)", "gerarDescricoesGroq")
    .addToUi();
}
