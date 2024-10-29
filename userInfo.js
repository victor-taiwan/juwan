let isMouseDown = false;
let datOkxMarket = 0;	//控制不連續觸發讀取okxMarket
let timerReadOkx = null;	//定期呼叫readOkx的計時器，增加呼叫checkWebSocket
const dtMarket = {};
// 警示訊息隊列
let alertQueue = [];
let isAlertVisible = false;

//載入後把parameters表中的格子加入可選取事件，從OKX讀取市場交易資料
document.addEventListener('DOMContentLoaded', function() {
	document.querySelectorAll('#parameters td').forEach(processCell);
	document.getElementById('startWork').addEventListener('change', function() {
		if (this.checked) {
			readOkx().then(createWsUserData);
		} else {
			if (wsUserData && wsUserData.readyState !== WebSocket.CLOSED && wsUserData.readyState !== WebSocket.CLOSING) {
				wsUserData.close();
			}
		}
	});
	document.getElementById('pauseTimer').addEventListener('change', function() {
		if (this.checked) {
			stopTimerReadOkx();
		} else {
			startTimerReadOkx();
		}
	});
	okxMarket();
});

//按下右鍵取消選取
document.addEventListener('contextmenu', function(ev) {
	ev.preventDefault();
	document.querySelectorAll('td.selected').forEach(cell => {
		cell.classList.remove('selected');
	});
}, false);


// 顯示警示訊息
function showAlert(message) {
	message = formatTimestamp(new Date().getTime()) + ':' + message;
	alertQueue.push(message);
	if (!isAlertVisible || alertQueue.length > 99) {
		displayNextAlert();
	}
}

// 顯示下一個警示訊息
function displayNextAlert() {
	document.getElementById("customAlert").style.display = "none";
	if (alertQueue.length > 0) {
		isAlertVisible = true;
		let message = alertQueue.shift();
		message += `[還有${alertQueue.length}則]`;
		document.getElementById("alertMessage").innerText = message;
		document.getElementById("customAlert").style.display = "block";
	} else {
		isAlertVisible = false;
	}
}

// 關閉當前警示訊息
function closeAlert() {
	alertQueue = [];
	displayNextAlert();
}

//新增策略
function newStrategy() {
	document.querySelectorAll('#market td.selected').forEach(td => {
		addStrategy(td.textContent, 'False', '0', '0.005', '6', '0.2', '-0.2');
	});
}

//加入策略
function addStrategy(nameValue, active, leverage, step, orderN, holdUp, holdDown) {
	if (isNameUnique(nameValue)) {
		const newRow = document.querySelector('#strategy tbody').insertRow();
		newRow.insertCell().textContent = nameValue;	//name
		const checkbox = Object.assign(document.createElement('input'), {
			type: 'checkbox'
			, checked: active.toLowerCase() === 'true'
		});
		newRow.insertCell().appendChild(checkbox);		//active
		newRow.insertCell().textContent = leverage;	//leverage
		newRow.insertCell().textContent = step;		//歩差
		newRow.insertCell().textContent = orderN;		//單數
		newRow.insertCell().textContent = holdUp;		//hold上限
		newRow.insertCell().textContent = holdDown;	//hold下限
		newRow.insertCell().textContent = '0';

		// 為新添加的 <td> 元素添加點擊事件
		newRow.querySelectorAll('td').forEach(processCell);
		if ('Key' in dicInfo) {
			setLeverage(dicInfo.Key, dicInfo.Secret, dicInfo.PassPhrase, 
				nameValue, dicParameters.defaultN);
				//傳送到OKX的leverage本來就要字串，不用再轉成數字
		}
	} else {
		showAlert('名稱重覆：' + nameValue);
	}
}

//新增strategy資料列前，先判斷是否name是否已存在於策略表中
function isNameUnique(name) {
	const rows = document.querySelectorAll('#strategy tbody tr');
	for (let row of rows) {
		const cell = row.getElementsByTagName('td')[0];
		if (cell && cell.textContent === name) {
			return false;
		}
	}
	return true;
}

//移除strategy表中name的資料列
function removeStrategy() {
	const selectedCells = document.querySelectorAll('#strategy td.selected');
    selectedCells.forEach(cell => {
		if (cell.cellIndex === 0) {
			const row = cell.parentElement;
			row.remove();
		}
	});
}

//新增td的選取事件：切換cell的class[selected]
function processCell(cell) {
	//if (!cell.querySelector('input[type="checkbox"]')) {
		cell.addEventListener('mousedown', handleMouseDown);
		cell.addEventListener('mouseup', handleMouseUp);
		cell.addEventListener('mouseenter', handleMouseEnter);
	//}
}

function handleMouseDown(event) {
	if (event.which === 1) { // 確保是左鍵點擊
		isMouseDown = true;
		document.querySelectorAll('td.selected').forEach(cell => {
			cell.classList.remove('selected');
		});
		this.classList.add('selected');
		event.preventDefault(); // 防止文字選擇
	}
}

function handleMouseUp(event) {
	if (isMouseDown) {
		isMouseDown = false;
	}
}

function handleMouseEnter(event) {
	if (isMouseDown) {
		this.classList.add('selected');
	}
}

//改表格資料，分parameters與strategy
function fillCell(strTable) {
	const inputText = document.getElementById('inputText').value;
	const newN = parsePercentage(inputText);
	if (!isNaN(newN)) {
		document.querySelectorAll(strTable + ' td.selected').forEach(cell => {
			let input = cell.querySelector('input[type="checkbox"]');
			if (input) {
				input.checked = !!parseFloat(newN);
			} else {
				cell.textContent = newN;
			}
		});
	}
}

//從OKX讀取市場交易資料
const okxMarket = (function() {
	let datOkxMarket = 0;
	return function() {
		//1秒內不連續觸發
		const currentTime = Date.now();
		if (currentTime - datOkxMarket >= 2000) {
			datOkxMarket = currentTime;
			const marketTable = document.querySelector('#market tbody');
			marketList().then(mt => {
				if (mt['Error'] === undefined) {
					let strHtml = '';
					Object.keys(dtMarket).forEach(name => delete dtMarket[name]);
					Object.entries(mt).forEach(([name, data]) => {
						//各行tr的HTML
						let tds = `<td>${name}</tds>`;
						tds += `<td>${data.price}</td>`;
						tds += `<td>${data.vol24h.toFixed(0)}</td>`;
						tds += `<td>${(data.ratioHL * 100).toFixed(2) + '%'}</td>`;
						tds += `<td>${data.increment}</td>`;
						tds += `<td>${data.ctVal}</td>`;
						tds += `<td>${(data.ctVal * data.price).toFixed(3)}</td>`;
						tds += `<td>${data.state}</td>`;
						strHtml += `<tr>${tds}</tr>`;
						//寫Market
						dtMarket[name] = {
							ctVal: parseFloat(data.ctVal)
							, increment: parseFloat(data.increment)
							, price: parseFloat(data.price)
							, ratioHL: parseFloat(data.ratioHL)
							, state: data.state
						}
					});
					marketTable.innerHTML = strHtml;
					marketTable.querySelectorAll('tr td:first-child').forEach(td => {
						processCell(td);
					});
				} else {
					showAlert('取得okxMarket市場資料失敗');
				}
			});
		}
	};
})();

//market表格排序
function sortTable(columnIndex) {
	let table = document.querySelector('#market tbody');
    const rows = Array.from(table.getElementsByTagName('tr'));

    // Determine if sorting is ascending or descending
    let ascending = table.getAttribute("data-sort-asc") === "true";
    table.setAttribute("data-sort-asc", !ascending);

    // Sort rows
    rows.sort((rowA, rowB) => {
        const cellA = rowA.getElementsByTagName("td")[columnIndex].innerText;
        const cellB = rowB.getElementsByTagName("td")[columnIndex].innerText;
		const numA = parsePercentage(cellA);
		const numB = parsePercentage(cellB);

        if (!isNaN(numA) && !isNaN(numB)) {
			const a = parseFloat(numA);
			const b = parseFloat(numB);
            // Compare numbers
            return ascending ? a - b : b - a;
        } else {
            // Compare strings
            return ascending ? cellA.localeCompare(cellB) : cellB.localeCompare(cellA);
        }
    });

    // Re-attach sorted rows
    rows.forEach(row => table.appendChild(row));
}

//取得User Config並填入
async function readOkx() {
	dicInfo = rwInfo_info();
	dicParameters = rwInfo_parameters();
	dtStrategy = rwInfo_strategy();
	const rw = await getUid(dicInfo.Key, dicInfo.Secret, dicInfo.PassPhrase);
	if (rw['Error'] === undefined && rw['code'] !== undefined && rw['code'] === '0') {
		//有交易權限才設定
		if (rw['data'][0]['perm'].split(',').includes('trade')) {
			document.getElementById('uid').textContent = rw['data'][0]['uid'];
			document.getElementById('label').textContent = rw['data'][0]['label'];
			dicInfo = rwInfo_info();	//再一次讀取uid和label
			startTimerReadOkx();	//啟動每5秒的timerAction()
		} else {
			document.getElementById('startWork').checked = false;
			showAlert('此API key 沒有交易權限');
		}
	} else {
		document.getElementById('startWork').checked = false;
		showAlert('讀取OKX資料失敗，請檢查網路或重設key, secret, passPhrase');
	}
	return rw;
}
//設定計時器，每5秒讀資金、部位、回報
function startTimerReadOkx() {
	if (timerReadOkx === null && !document.getElementById('pauseTimer').checked) {
		if (window.Worker) {
			timerReadOkx = new Worker('timerWorker.js');
			timerReadOkx.onmessage = function(event) {
				if (event.data==='dingDong') {
					timerAction();
					timerReadOkx.postMessage(5000);
				}
			};
			timerReadOkx.postMessage(5000);
		} else {
			timerReadOkx = setInterval(timerAction, 5000);
		}
	}
}

// 停止計時器的函數
function stopTimerReadOkx() {
    if (window.Worker && timerReadOkx instanceof Worker) {
        timerReadOkx.terminate();
        timerReadOkx = null;
    } else if (timerReadOkx !== null) {
        clearInterval(timerReadOkx);
        timerReadOkx = null;
    }
}

//定時動作
async function timerAction() {
	await readAmt()			//只取earn的資料，其值為金融帳戶總額，含非USDT
	await okxTrading();		//取得金融帳戶餘額，然後取得交易帳戶資料
	await okxPosition();	//取得持倉金額
	await reply();		//取得回報
	raiseLeverage();	//定時增加leverage（小小的）
	checkWebSocket();	//檢查WebSocket有無連線
	checkRisk();		//執行風控，ratioHL裡會startStrategy
	//執行輕量級的DOM操作來保持網頁活躍
	document.body.style.backgroundColor = "#FAFAFA";
	document.body.style.backgroundColor = "white";
	const now = new Date();		//以下在子夜記錄總資金
	if (now.getHours()=== 0 && now.getMinutes() === 0) {
		console.clear();
		dicCapital.day_ago = dicCapital.total;
	}
	
}

//定時增加leverage，dtStrategy與HTML策略表
function raiseLeverage() {
	const raise = Math.pow((1 + parseFloat(dicParameters.LeverageUp)), 5 / 86400);	//每5秒增加數字
	const singleMaxL = parseFloat(dicParameters.MaxTotalL) / Math.max(dtStrategy.length, 1);	//單一策略最大增加到
	const dicLeverage = {};
	dtStrategy.forEach(drS => {
		drS.leverage = Math.min(drS.leverage * raise, singleMaxL);
		dicLeverage[drS.name] = drS.leverage;
	});
	document.querySelectorAll('#strategy tbody tr').forEach(row => {
		const cells = row.getElementsByTagName('td');
		const name = cells[0].textContent.trim();
		if (dicLeverage[name] !== undefined) {
			cells[2].textContent = dicLeverage[name];
		} else {
			cells[2].textContent = '0';
		}
	});
}			

//取得各帳戶餘額
const readAmt = (function () {
	//起始設倒退61秒，以防第一次不會執行
	let datR = new Date(new Date().getTime() - 61 * 1000);
	return async function() {
		const current = new Date();
		 // 检查是否已经过了60秒
		if ((current - datR) / 1000 > 60) {
			datR = current;
			const rw = await assetValue(dicInfo.Key, dicInfo.Secret, dicInfo.PassPhrase);
			if (rw['Error'] === undefined) {
				if (rw['code'] !== undefined && rw['code'] === '0') {
					// 更新 dicCapital.earn 并更新页面内容
					dicCapital.earn = parseFloat(rw['data'][0]['details']['earn']);
					document.getElementById('earn').textContent = dicCapital.earn.toFixed(2);
				}
			}
		}
	};
})();

//取得交易帳戶資料
async function okxTrading() {
	const rw = await tradingAccount(dicInfo.Key, dicInfo.Secret, dicInfo.PassPhrase);
	if(rw['Error'] === undefined && rw['code'] !== undefined && rw['code'] === '0') {
		rw['data'].forEach(data => data.details.forEach(details => {
			if (details.ccy === 'USDT') {
				dicCapital.usdt = parseFloat(details.eq);
				dicCapital.avail = parseFloat(details.availEq);
				dicCapital.total = dicCapital.usdt + dicCapital.earn - parseFloat(dicParameters.fixed);
				document.getElementById('usdt').textContent = dicCapital.usdt.toFixed(2);
				document.getElementById('total').textContent = dicCapital.total.toFixed(2);
				document.getElementById('avail').textContent = dicCapital.avail.toFixed(2);
			}
		}));
	}
}

//取得所有持倉，填入策略表，總數填入資料表（正負相消，不在策略表中的亦列入計算）
async function okxPosition() {
	const rw = await positions(dicInfo.Key, dicInfo.Secret, dicInfo.PassPhrase);
	if (rw['Error'] === undefined) {
		const sum = Object.values(rw).reduce((acc, val) => acc + val, 0);
		document.getElementById('position').textContent = sum.toFixed(4);
		dicCapital.position = sum;
		document.querySelectorAll('#strategy tbody tr').forEach(row => {
			const cells = row.getElementsByTagName('td');
			const name = cells[0].textContent.trim();
			if (rw[name] !== undefined) {
				cells[7].textContent = rw[name].toFixed(4);
			} else {
				cells[7].textContent = '0';
			}
		});
		dtStrategy.forEach(drS => {
			drS.hold = (drS.name in rw) ? rw[drS.name] : 0;
		});
	}			
}

//取得未成交明細
async function reply() {
	const orders = await openOrder(dicInfo.Key, dicInfo.Secret, dicInfo.PassPhrase);
	const newReply = {};
	for (let order of orders) {
		newReply[order['ordId']] = {};
		['clOrdId','instId','state','side','px'].forEach(item => {
			newReply[order['ordId']][item] = order[item];
		});
		
		['sz', 'accFillSz'].forEach(item => {
			const val = dtMarket[order['instId']] ? dtMarket[order['instId']]['ctVal'] : 1;
			const vol = floatToString(parseInt(order[item]) * val);
			newReply[order['ordId']][item] = vol;
		});
		
		const cTime = formatTimestamp(parseInt(order['cTime']));
		newReply[order['ordId']]['cTime'] = cTime;
	}
	dtReply = newReply;			
	compareReply();		//比較新舊回報表
	countReply();		//計算回報表項數輸出到<select id='orderCount'>
	delayReply();
}

//更新（重置）頁面顯示的回報表
const delayReply = (function() {
	let replyTimer = 0;
	const displayReply = function() {
		let replyHTML = '';
		Object.keys(dtReply).forEach(id => {
			let tds = `<td>${id}</td>`;
			const dr = dtReply[id];
			['clOrdId','instId','state','side','px', 'sz', 'accFillSz', 'cTime'].forEach(key =>{
				tds += `<td>${dr[key]}</td>`;
			});
			replyHTML += `<tr>${tds}</tr>`;
		});
		document.querySelector('#reply tbody').innerHTML = replyHTML;
		replyTimer = 0;
	}
	return function () {
		if (replyTimer > 0) clearTimeout(replyTimer);
		replyTimer = setTimeout(displayReply, 1000);
	}
})();

//比較新回報表，若項目數不是'單數'兩倍，重新下
function compareReply() {
	const dtReplyData = Object.values(dtReply);
	dtStrategy.forEach(drS => {
		const dtRsN = dtReplyData.filter(data => data.instId === drS.name).length;
		if (dtRsN !== parseInt(drS.單數) * 2) {
			startStrategy(drS.name);
			//showAlert(`${drS.name}回報數不同，重下`);
		}
	})
	//舊的Order不在newReply中，查詢後若已成交進行orderFilled
	/*
	Object.keys(dtReply).filter(ordId => !(ordId in newReply)).forEach(ordId => {
		const instId = dtReply[ordId].instId;
		const od = uniqueOrder(dicInfo.Key, dicInfo.Secret, dicInfo.PassPhrase, instId, ordId);
		//ChatGPT說下面這種加?的可選鏈是現代寫法
		if (od?.state === 'filled') orderFilled(dtReply[od.ordId]);
		//因為執行完以後就會指定dtReply = newReply，所以不用再去處理delete dtReply(ordId)
	});
	*/
}

//輸出回報表不同instId的個數
function countReply() {
    // 使用 reduce 计算第三列中每种 textContent 的数量
	const replyLength = Object.keys(dtReply).length;
    const counts = Object.values(dtReply).reduce((accumulator, drR) => {
		if (accumulator[drR.instId]) {
			accumulator[drR.instId]++;
		} else {
			accumulator[drR.instId] = 1;
		}
        return accumulator;
    }, {});

	const orderCount = document.getElementById('orderCount');
	const currentOptions = Array.from(orderCount.options).map(option => option.text);
	const newOptions = [`All, ${replyLength}單`, 
		...Object.entries(counts).map(([text, count]) => `${text}, ${count}單`)];
	const isSame = currentOptions.length === newOptions.length 
	&& currentOptions.every((option, index) => option === newOptions[index]);

	// 如果内容不同，更新orderCount
	if (!isSame) {
		orderCount.innerHTML = '';
		newOptions.forEach(optionText => {
			const option = document.createElement('option');
			option.text = optionText;
			orderCount.add(option);
		});
	}
}

//取得歷史成交資料
async function getHistory(btn) {
	btn.disabled = true;
	const i = document.getElementById('historyInterval').selectedIndex;
	if (i >= 0) {
		const ods = await historyOrder(dicInfo.Key, dicInfo.Secret, dicInfo.PassPhrase, i);
		const summary = odsSummary(ods);
		Object.keys(summary).forEach(instId => {
			summary[instId].買均價 = summary[instId].買額 / (summary[instId].買量 || 1);
			summary[instId].賣均價 = summary[instId].賣額 / (summary[instId].賣量 || 1);
			summary[instId].增減 = summary[instId].買量 - summary[instId].賣量;
			summary[instId].均成本 = (summary[instId].買額 - summary[instId].賣額) / (summary[instId].增減 || 1);
		});
		populateTable(summary);
	}
	btn.disabled = false;
}

//填入#history
function populateTable(summary) {
	const tbody = document.querySelector('#history tbody');
	tbody.innerHTML = '';

    Object.keys(summary).forEach(name => {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        nameCell.textContent = name;
        row.appendChild(nameCell);

        const keys = ['初時', '初價', '買次', '買量', '買均價', '賣次', '賣量', '賣均價', '終時', '終價', '增減', '均成本'];
        keys.forEach(key => {
            const cell = document.createElement('td');
            if (key === '終時' || key === '初時') {
                cell.textContent = formatTimestamp(summary[name][key]); // 显示格式化后的日期时间
            } else {
                cell.textContent = floatToString(summary[name][key], 4);
            }
            row.appendChild(cell);
        });

        tbody.appendChild(row);
    });
}

//彙總歷史成交訂單
function odsSummary(ods) {
	const summary = ods.reduce((acc, od) => {
		if (!(od.instId in acc)) {
			acc[od.instId] = {
				買次: 0
				, 買量: 0
				, 買額: 0
				, 賣次: 0
				, 賣量: 0
				, 賣額: 0
				, 終時: parseInt(od.fillTime)
				, 終價: parseFloat(od.avgPx)
			}
		}
		acc[od.instId].初時 = parseInt(od.fillTime);
		acc[od.instId].初價 = parseFloat(od.avgPx);
		if (od.side === 'buy') {
			acc[od.instId].買次++;
			acc[od.instId].買量 += parseFloat(od.accFillSz);
			acc[od.instId].買額 += od.accFillSz * od.avgPx;	//用*會自動轉數字
		} else {
			acc[od.instId].賣次++;
			acc[od.instId].賣量 += parseFloat(od.accFillSz);
			acc[od.instId].賣額 += od.accFillSz * od.avgPx;	//用*會自動轉數字
		}
		return acc;
	}, {});
	//調整ctVal
	Object.keys(summary).forEach(instId => {
		const ctVal = dtMarket[instId].ctVal;
		['買量', '買額', '賣量', '賣額'].forEach(key => {
			summary[instId][key] *= ctVal;
		});
	});
	return summary;
}
//按下「全刪單」之動作
function btnCancelAll() {
	const orderCount = document.getElementById('orderCount');
	const index = orderCount.selectedIndex;
	if (index !== -1) {
		const instId = orderCount.options[index].text.split(',')[0];
		cancelAll(instId);
	}
}

//小數轉字串，縮減浮點數誤差
function floatToString(num, precision = 10) {
	if (isNaN(num)) {
		return num;
	} else {
		num = parseFloat(num);
		const sign = Math.sign(num);
		num = Math.abs(num);
		let str = parseFloat(num.toExponential(precision)).toString();
		if (str.includes('e')) {
			const parts = str.split('e');
			const base = parts[0].replace(/\./, '');
			const e = parseInt(parts[1]);
			if (e<0) {
				str = `0.${'0'.repeat(-e - 1)}${base}`;
			} else {
				str = base.padEnd(e + 1, '0');
			}
		}
		return (sign === -1 ? '-' : '') + str;
	}
}

// 解析百分比並根據小數位數轉換為小數格式
function parsePercentage(input) {
	// 使用正則表達式檢查是否包含百分比符號%
	const percentagePattern = /^([\d.]+)%$/;
	const match = input.match(percentagePattern);

	if (match) {
		// 如果匹配成功，取得捕獲組的數字部分
		return floatToString(parseFloat(match[1]) / 100);
	} else {
		// 如果不包含百分比符號，為數字直接返回，不為數字返回'N/A'
		if (!isNaN(input)) {
			return input;
		} else {
			return 'N/A';
		}
	}
}

//轉換時間格式
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // 月份从0开始
    const day = String(date.getDate()).padStart(2, '0');

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}
