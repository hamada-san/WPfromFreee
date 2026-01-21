/**
 * 新規クライアント作成
 */
function createNewClient() {
  const ui = SpreadsheetApp.getUi();
  
  if (!checkAuth()) {
    showAuthDialog();
    return;
  }
  
  let companies;
  try {
    companies = fetchCompaniesFromFreee();
  } catch (e) {
    ui.alert("エラー", "事業所リストの取得に失敗しました: " + e.message, ui.ButtonSet.OK);
    return;
  }
  
  if (companies.length === 0) {
    ui.alert("エラー", "freeeに登録されている事業所がありません。", ui.ButtonSet.OK);
    return;
  }
  
  const savedFolderId = getSavedFolderId();
  const savedFolderName = getSavedFolderName();
  const htmlContent = createCompanySelectHtml(companies, savedFolderId, savedFolderName);
  const html = HtmlService.createHtmlOutput(htmlContent)
    .setWidth(500)
    .setHeight(420);
  ui.showModalDialog(html, '事業所を選択してください');
}

function getFiscalYearsForDialog(companyId) {
  const accessToken = getService().getAccessToken();
  return getFiscalYearsForCompany(companyId, accessToken);
}

function extractFolderId(input) {
  const value = String(input || "").trim();
  if (!value) return "";
  const foldersMatch = value.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (foldersMatch) return foldersMatch[1];
  const idMatch = value.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];
  if (value.includes("drive.google.com")) {
    const parts = value.split("/");
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      if (part && !part.includes("view") && !part.includes("edit") && !part.includes("folders")) {
        return part.split("?")[0];
      }
    }
  }
  return value;
}

/**
 * 事業所選択用HTMLを生成
 */
function createCompanySelectHtml(companies, savedFolderId, savedFolderName) {
  let options = companies.map(c => 
    `<option value="${c.id}">${c.display_name || c.name}</option>`
  ).join('');
  
  const showFolderInfo = savedFolderName ? 'block' : 'none';
  
  return `<!DOCTYPE html>
    <html>
    <head>
      <base target="_top">
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; margin: 0; color: #333; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; }
        select, input[type="text"] { width: 100%; padding: 10px 12px; font-size: 14px; border: 1px solid #ddd; border-radius: 6px; background: #fff; }
        select:focus, input[type="text"]:focus { outline: none; border-color: #4285f4; }
        .folder-section { background: #f8f9fa; padding: 16px; border-radius: 8px; border: 1px solid #e0e0e0; }
        .folder-info { font-size: 13px; color: #1a73e8; margin-bottom: 12px; padding: 8px; background: #e8f0fe; border-radius: 4px; display: ${showFolderInfo}; }
        .note { font-size: 12px; color: #666; margin-top: 8px; }
        .button-row { display: flex; gap: 12px; margin-top: 24px; }
        .submit-btn { background-color: #4285f4; color: white; padding: 12px 24px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; border-radius: 6px; flex: 1; }
        .submit-btn:hover { background-color: #3367d6; }
        .submit-btn:disabled { background-color: #ccc; cursor: not-allowed; }
        .cancel-btn { background-color: #fff; color: #666; padding: 12px 24px; border: 1px solid #ddd; cursor: pointer; font-size: 14px; border-radius: 6px; }
        .cancel-btn:hover { background-color: #f5f5f5; }
        .loading { display: none; color: #4285f4; margin-top: 16px; font-size: 14px; }
        .file-note { background: #e8f0fe; padding: 12px; border-radius: 6px; font-size: 13px; color: #1a73e8; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="form-group">
        <label>① 事業所を選択</label>
        <select id="companyId" onchange="loadFiscalYears()">${options}</select>
      </div>
      <div class="form-group">
        <label>② 事業年度を選択</label>
        <select id="fiscalYear">
          <option value="">読み込み中...</option>
        </select>
      </div>
      <div class="form-group">
        <label>③ 保存先フォルダURL</label>
        <div class="folder-section">
          <div class="folder-info" id="folderInfo">📁 現在の保存先: ${savedFolderName}</div>
          <input type="text" id="folderId" value="${savedFolderId}">
          <div class="note">※ 空欄の場合はマイドライブ直下に作成されます</div>
          <div class="note">※ フォルダURLを貼り付けるか、フォルダIDを入力してください</div>
        </div>
      </div>
      
      <div class="button-row">
        <button class="cancel-btn" onclick="google.script.host.close()">キャンセル</button>
        <button id="submitBtn" class="submit-btn" onclick="submitForm()">作成して試算表取得</button>
      </div>
      <div class="loading" id="loading">⏳ 処理中です。しばらくお待ちください...</div>
      <script>
        function submitForm() {
          const companyId = document.getElementById('companyId').value;
          const folderId = document.getElementById('folderId').value.trim();
          const fiscalYearValue = document.getElementById('fiscalYear').value;
          if (!companyId) {
            alert('事業所を選択してください。');
            return;
          }
          if (!fiscalYearValue) {
            alert('事業年度を選択してください。');
            return;
          }
          document.getElementById('submitBtn').disabled = true;
          document.getElementById('loading').style.display = 'block';
          google.script.run
            .withSuccessHandler(function(result) { google.script.host.close(); })
            .withFailureHandler(function(error) {
              alert('エラー: ' + error.message);
              document.getElementById('submitBtn').disabled = false;
              document.getElementById('loading').style.display = 'none';
            })
            .processNewClient(companyId, folderId, fiscalYearValue);
        }
        
        function loadFiscalYears() {
          const companyId = document.getElementById('companyId').value;
          const fiscalSelect = document.getElementById('fiscalYear');
          fiscalSelect.innerHTML = '<option value="">読み込み中...</option>';
          google.script.run
            .withSuccessHandler(function(list) {
              if (!list || list.length === 0) {
                fiscalSelect.innerHTML = '<option value="">事業年度が登録されていません</option>';
                return;
              }
              fiscalSelect.innerHTML = list.map(function(fy, idx) {
                const value = fy.startDate + '|' + fy.endDate;
                const selected = idx === 0 ? ' selected' : '';
                return '<option value=\"' + value + '\"' + selected + '>' + fy.label + '</option>';
              }).join('');
            })
            .withFailureHandler(function(error) {
              fiscalSelect.innerHTML = '<option value=\"\">読み込み失敗</option>';
              alert('エラー: ' + error.message);
            })
            .getFiscalYearsForDialog(companyId);
        }
        
        loadFiscalYears();
      </script>
    </body>
    </html>`;
}

/**
 * 新規クライアント処理
 */
function processNewClient(companyId, folderId, fiscalYearValue) {
  const accessToken = getService().getAccessToken();
  if (!fiscalYearValue) {
    throw new Error("事業年度を選択してください。");
  }
  const fiscalParts = String(fiscalYearValue).split("|");
  const startDateStr = fiscalParts[0];
  const endDateStr = fiscalParts[1];
  if (!startDateStr || !endDateStr) {
    throw new Error("事業年度の指定が不正です。");
  }
  const folderInput = folderId;
  folderId = extractFolderId(folderInput);
  const companyDetails = getCompanyDetails(companyId, accessToken, startDateStr, endDateStr);
  const workerEmail = Session.getActiveUser().getEmail();
  
  const mainSs = SpreadsheetApp.getActiveSpreadsheet();
  let configSheet = mainSs.getSheetByName("クライアント一覧");
  
  if (!configSheet) {
    configSheet = createConfigSheet(mainSs);
  }
  
  if (folderId) {
    saveFolderId(folderId);
  }
  
  const fileName = `WP_${companyDetails.companyName}_${companyDetails.periodLabel}`;
  const newSs = SpreadsheetApp.create(fileName);
  const newSsId = newSs.getId();
  const newSsUrl = newSs.getUrl();
  let folderUrl = "";
  
  const excludedSheets = ["クライアント一覧", "事業所リスト"];
  const templateSheets = mainSs.getSheets();
  const defaultSheet = newSs.getSheets()[0];
  let hasCopied = false;
  if (defaultSheet) {
    defaultSheet.setName("_tmp_default");
  }
  templateSheets.forEach(sheet => {
    const name = sheet.getName();
    if (excludedSheets.includes(name)) return;
    const copied = sheet.copyTo(newSs);
    copied.setName(name);
    hasCopied = true;
  });
  if (defaultSheet && hasCopied) {
    newSs.deleteSheet(defaultSheet);
  }
  copyNamedRanges(mainSs, newSs);
  copyFormulasFromTemplate(mainSs, newSs);
  
  if (folderId) {
    try {
      DriveApp.getFileById(newSsId).moveTo(DriveApp.getFolderById(folderId));
      folderUrl = DriveApp.getFolderById(folderId).getUrl();
    } catch (e) {
      Logger.log("フォルダ移動エラー: " + e.message);
    }
  }
  if (!folderUrl) {
    try {
      const parents = DriveApp.getFileById(newSsId).getParents();
      if (parents.hasNext()) {
        folderUrl = parents.next().getUrl();
      }
    } catch (e) {
      Logger.log("フォルダURL取得エラー: " + e.message);
    }
  }
  
  const docketSheet = newSs.getSheetByName("管理ドケット");
  if (docketSheet) {
    docketSheet.getRange("D8").setValue(companyDetails.companyName);
    docketSheet.getRange("D9").setValue(companyDetails.periodLabel);
    docketSheet.getRange("D11").setValue(new Date(companyDetails.startDate));
    docketSheet.getRange("D12").setValue(new Date(companyDetails.endDate));
    docketSheet.getRange("D14").setValue(companyDetails.companyId);
  }
  
  const taxSheet = newSs.getSheetByName("税務基本ステータス");
  if (taxSheet) {
    taxSheet.getRange("D16").setValue(companyDetails.address);
    taxSheet.getRange("D18").setValue(companyDetails.headName);
  }
  
  const bsSheet = newSs.getSheetByName("BS");
  const plSheet = newSs.getSheetByName("PL");
  if (bsSheet) bsSheet.getRange("B1").setValue(companyDetails.companyName);
  if (plSheet) plSheet.getRange("B1").setValue(companyDetails.companyName);
  
  try {
    getTrialBalanceAndPLCore(newSs, companyDetails.companyId, companyDetails.startDate, companyDetails.endDate);
  } catch (e) {
    addToClientList(configSheet, companyDetails, newSsId, newSsUrl, folderUrl, "❌ エラー", workerEmail);
    throw new Error("シートは作成しましたが、試算表取得でエラー: " + e.message);
  }
  
  addToClientList(configSheet, companyDetails, newSsId, newSsUrl, folderUrl, "✅ 完了", workerEmail);
  
  SpreadsheetApp.getActiveSpreadsheet().toast(`「${companyDetails.companyName}」のシートを作成しました。`, "完了", 5);
  
  return "完了";
}

/**
 * 選択したクライアントの試算表を再取得
 */
function refreshSelectedClient() {
  const ui = SpreadsheetApp.getUi();
  
  if (!checkAuth()) {
    showAuthDialog();
    return;
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName("クライアント一覧");
  
  if (!configSheet) {
    ui.alert("エラー", "「クライアント一覧」シートがありません。", ui.ButtonSet.OK);
    return;
  }
  
  const activeRow = configSheet.getActiveCell().getRow();
  if (activeRow <= 1) {
    ui.alert("エラー", "クライアント一覧の2行目以降を選択してください。", ui.ButtonSet.OK);
    return;
  }
  
  const companyName = configSheet.getRange(activeRow, 1).getValue();
  const companyId = configSheet.getRange(activeRow, 2).getValue();
  const targetId = configSheet.getRange(activeRow, 5).getValue();
  
  if (!targetId) {
    ui.alert("エラー", "スプレッドシートIDがありません。", ui.ButtonSet.OK);
    return;
  }
  
  try {
    configSheet.getRange(activeRow, 8).setValue("処理中...");
    SpreadsheetApp.flush();
    
    const accessToken = getService().getAccessToken();
    const companyDetails = getCompanyDetails(companyId, accessToken);
    const workerEmail = Session.getActiveUser().getEmail();
    
    const targetSs = SpreadsheetApp.openById(targetId);
    const docketSheet = targetSs.getSheetByName("管理ドケット");
    if (docketSheet) {
      docketSheet.getRange("D11").setValue(new Date(companyDetails.startDate));
      docketSheet.getRange("D12").setValue(new Date(companyDetails.endDate));
    }
    
    configSheet.getRange(activeRow, 3).setValue(companyDetails.periodLabel);
    configSheet.getRange(activeRow, 4).setValue(new Date(companyDetails.endDate));
    
    getTrialBalanceAndPLCore(targetSs, companyDetails.companyId, companyDetails.startDate, companyDetails.endDate);
    
    configSheet.getRange(activeRow, 8).setValue("✅ 完了");
    configSheet.getRange(activeRow, 9).setValue(getTimestamp());
    configSheet.getRange(activeRow, 10).setValue(workerEmail);
    
    ui.alert("完了", `「${companyName}」の試算表を再取得しました。`, ui.ButtonSet.OK);
  } catch (e) {
    configSheet.getRange(activeRow, 8).setValue("❌ エラー");
    configSheet.getRange(activeRow, 9).setValue(getTimestamp());
    ui.alert("エラー", e.message, ui.ButtonSet.OK);
  }
}

function copyNamedRanges(sourceSs, targetSs) {
  const existing = {};
  targetSs.getNamedRanges().forEach(nr => {
    existing[nr.getName()] = true;
  });
  
  sourceSs.getNamedRanges().forEach(nr => {
    const name = nr.getName();
    const range = nr.getRange();
    const sheetName = range.getSheet().getName();
    const targetSheet = targetSs.getSheetByName(sheetName);
    if (!targetSheet) return;
    const targetRange = targetSheet.getRange(range.getA1Notation());
    if (existing[name]) {
      try {
        targetSs.removeNamedRange(name);
      } catch (e) {
        Logger.log("NamedRange削除エラー: " + e.message);
      }
    }
    try {
      targetSs.setNamedRange(name, targetRange);
    } catch (e) {
      Logger.log("NamedRange作成エラー: " + e.message);
    }
  });
}

function copyFormulasFromTemplate(sourceSs, targetSs) {
  sourceSs.getSheets().forEach(sourceSheet => {
    const targetSheet = targetSs.getSheetByName(sourceSheet.getName());
    if (!targetSheet) return;
    const dataRange = sourceSheet.getDataRange();
    const formulas = dataRange.getFormulas();
    const startRow = dataRange.getRow();
    const startCol = dataRange.getColumn();
    for (let r = 0; r < formulas.length; r++) {
      let c = 0;
      while (c < formulas[r].length) {
        if (!formulas[r][c]) {
          c++;
          continue;
        }
        const start = c;
        while (c < formulas[r].length && formulas[r][c]) {
          c++;
        }
        const width = c - start;
        const rowFormulas = [formulas[r].slice(start, c)];
        targetSheet.getRange(startRow + r, startCol + start, 1, width).setFormulas(rowFormulas);
      }
    }
  });
}
