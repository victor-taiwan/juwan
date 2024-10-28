//市場交易資料做為dic回傳
async function marketList() {
	const market = JSON.parse(await getMarket());
	const trade = JSON.parse(await getTrade());
	//取得市場失敗
	if (market['Error'] !== undefined || market['code'] === undefined || market['code'] !== '0') {
		return {Error: 'getMarket failed'};
	}
	//取得交易失敗
	if (trade['Error'] !== undefined || trade['code'] === undefined || trade['code'] !== '0') {
		return {Error: 'getTrade failed'};
	}
	//成功取得市場與交易繼續處理資料
	let marketTrade = {};
	market['data'].forEach(data => {
		//只做USDT交割永續合約
		if (data['settleCcy'] === 'USDT') {
			marketTrade[data['instId']] = {
				increment: parseFloat(data['tickSz'])
				, ctVal: parseFloat(data['ctVal'])
				, state: data['state']
			}
		}
	});
	trade['data'].forEach(data => {
		//如果市場資料已列如本商品，再加入交易資料
        if (marketTrade[data['instId']] !== undefined) {
            marketTrade[data['instId']] = {
                ...marketTrade[data['instId']],
                price: parseFloat(data['last']),
                vol24h: parseFloat(data['volCcy24h']) * parseFloat(data['last']),
                ratioHL: parseFloat(data['high24h']) / parseFloat(data['low24h']) - 1
            };
        }
    });
	return marketTrade;
}

//讀取市場資料，傳回Json string
async function getMarket() {
	try {
		const response = await fetch("https://www.okx.com/api/v5/public/instruments?instType=SWAP", {
		method: 'GET',
		timeout: 30000 // 30 seconds timeout
		});

        const strR = await response.text();
		return strR;
	} catch (error) {
		return JSON.stringify({Error: 'fetch failed', msg: error.message});
	}
}

//讀取交易資料，傳回json string
async function getTrade() {
	try {
		const response = await fetch("https://www.okx.com/api/v5/market/tickers?instType=SWAP", {
		method: 'GET',
		timeout: 30000 // 30 seconds timeout
		});

        const strR = await response.text();
		return strR;
	} catch (error) {
		return JSON.stringify({Error: 'fetch failed', msg: error.message});
	}
}

//取得user Info，傳回dic
async function getUid(strKey, strSecret, strPassPhrase) {
    const uri = "/api/v5/account/config";
    const result = await getResponse(strKey, strSecret, strPassPhrase, uri);
    return JSON.parse(result);
}

//取得交易帳戶資料，只拿USDT資料
async function tradingAccount(strKey, strSecret, strPassPhrase) {
	const uri = '/api/v5/account/balance';
	const result = await getResponse(strKey, strSecret, strPassPhrase, uri, "ccy=USDT");
	return JSON.parse(result);
}

//取得金融帳戶餘額 <-- 會被CORS擋住
async function savingsAmt(strKey, strSecret, strPassPhrase) {
	const uri = "/api/v5/finance/savings/balance";
	//const uri = "/api/v5/account/positions";
	const result = await getResponse(strKey, strSecret, strPassPhrase, uri);
	console.log(result);
}

//取得各帳戶餘額in USDT
async function assetValue(strKey, strSecret, strPassPhrase) {
	const uri = "/api/v5/asset/asset-valuation";
	const result = await getResponse(strKey, strSecret, strPassPhrase, uri, "ccy=USDT");
	return JSON.parse(result);
}

//取得合約持倉訊息，返回{...name: number}
async function positions(strKey, strSecret, strPassPhrase) {
	const uri = "/api/v5/account/positions";
	const result = await getResponse(strKey, strSecret, strPassPhrase, uri, "instType=SWAP");
	const rw = JSON.parse(result);
	if (rw['code'] !== undefined && rw['code'] === '0') {
		let posUsd = {};
		rw['data'].forEach(comm => {
			//有ctVal計算USDT，否則直接取USD
			if (dtMarket[comm['instId']]) {
				const usdt = parseInt(comm['pos']) * parseFloat(comm['last']) * dtMarket[comm['instId']]['ctVal'];
				posUsd[comm['instId']] = usdt;
			} else {
				const usd = Math.sign(parseInt(comm['pos'])) * parseFloat(comm['notionalUsd']);
				posUsd[comm['instId']] = usd;
			}
		});
		return posUsd;
	} else {
		return {Error: rw['msg'] !== undefined ? rw['msg'] : 'No message'};
	}
}

//取得未成交訂單明細，返回[...{}]
async function openOrder(strKey, strSecret, strPassPhrase) {
	const uri = "/api/v5/trade/orders-pending";
	let count = 0;
	let after = "";
	let orders = [];
	do {
		const payload = 'instType=SWAP' + (after ? `&after=${after}` : '');
		const rw = JSON.parse(await getResponse(strKey, strSecret, strPassPhrase, uri, payload));
		if (rw['code'] === '0') {
			orders.push(...rw['data']);
			count = rw['data'].length;
			//有100項可能後面還有，須設定after繼續取
			if (count >= 100) {
				after = rw['data'][count - 1]['ordId'];
			}
		} else {
			break;
		}
	} while (count >= 100);
	orders.sort((a, b) => {
		// 先按 instId 排序
		if (a.instId < b.instId) return -1;
		if (a.instId > b.instId) return 1;

		// 如果 instId 相等，则按 side 排序
		if (a.side < b.side) return -1;
		if (a.side > b.side) return 1;
		
		//如果 instId, name 都相等，按 px 排序
		if (parseFloat(a.px) < parseFloat(b.px)) return -1;
		if (parseFloat(a.px) > parseFloat(b.px)) return 1;
		
		return 0;
	});
	return orders;
}

//取得單一委託單的明細，返回od{}或undefined
async function uniqueOrder(strKey, strSecret, strPassPhrase, instId, ordId) {
	const uri = "/api/v5/trade/order";
	const payload = `instId=${instId}&ordId=${ordId}`;
	const rw = JSON.parse(await getResponse(strKey, strSecret, strPassPhrase, uri, payload));
	console.log(rw);
	if (rw.code === '0') return rw.data[0];	//理論上會有單一委託單
}

//取得歷史成交資料，interval = 0 是七天，1 是三月
async function historyOrder(strKey, strSecret, strPassPhrase, interval) {
	const uri = interval ? '/api/v5/trade/orders-history-archive' : '/api/v5/trade/orders-history';
	const coldTimes = interval ? 20 : 40;
	let times = 0;
	let after = '';
	let count = 0;
	const orders = [];
	do {
		const payload = 'instType=SWAP&state=filled' + (after ? `&after=${after}` : '');
		const rw = JSON.parse(await getResponse(strKey, strSecret, strPassPhrase, uri, payload));
		if (rw['code'] === '0') {
			orders.push(...rw['data']);
			count = rw['data'].length;
			//有100項可能後面還有，須設定after繼續取
			if (count >= 100) {
				after = rw['data'][count - 1]['ordId'];
			}
		} else {
			console.log(rw);
			break;
		}
		//呼叫次數觸及上限，冷卻2秒
		if (++times >= coldTimes) {
			times = 0;
			await new Promise(resolve => setTimeout(resolve, 2000));
		}
	} while (count >= 100);
	return orders;
}

//設定商品保證金槓桿
async function setLeverage(strKey, strSecret, strPassPhrase, strInstId, strLeverage) {
    const dic = {
        instId: strInstId,
        lever: strLeverage,
        mgnMode: "cross" // 設定全倉
    };

    const strBodyJson = JSON.stringify(dic);
    const uri = "/api/v5/account/set-leverage";
    const result = await postResponse(strKey, strSecret, strPassPhrase, uri, strBodyJson);
    const rw = JSON.parse(result);

    if (rw.code !== "0") showAlert(`setLeverage failed: ${rw.msg}`);
}

//postRequest送單
async function postOrder(strKey, strSecret, strPassPhrase, ods) {
	for (let i = 0; i <= Math.floor((ods.length - 1) / 20); i++) {
		const lstS = ods.slice(i * 20, i * 20 + 20);	// 要送出的list
		const jsn = JSON.stringify(lstS);
		const strUri = '/api/v5/trade/batch-orders';
		if (document.getElementById('startWork').checked) {
			const result = await postResponse(strKey, strSecret, strPassPhrase, strUri, jsn);
			const rw = JSON.parse(result);
			if (!('Error' in rw) && rw['code'] && rw['code'] === '0') {
				rw['data'].forEach(od => {
					if (dtReply && od.clOrdId in dtReply) {
						if (od.sCode = '0') {
							dtReply[od.ordId] = dtReply[od.clOrdId];
							delete dtReply[od.clOrdId];
							//若currentState不存在會傳回-1，小於任何有效索引
							const currentState = dtReply[od.ordId]['state'];
							if (strState.indexOf(currentState) < strState.indexOf("sent")) {
								dtReply[od.ordId]['state'] = "sent";
							}
						} else {
							dtReply[od.clOrdId]['state'] = 'failed';
							dtReply[od.clOrdId]['sMsg'] = od.sMsg;
						}
					}
				});
			} else {
				console.log(result);
			}
		} else {
			console.log(jsn);
		}
	}
}

//postRequest刪單
async function postCancel(strKey, strSecret, strPassPhrase, ods) {
	for (let i = 0; i <= Math.floor((ods.length - 1) / 20); i++) {
		const lstS = ods.slice(i * 20, i * 20 + 20);	// 要送出的list
		const jsn = JSON.stringify(lstS);
		const strUri = '/api/v5/trade/cancel-batch-orders';
		if (document.getElementById('startWork').checked) {
			const result = await postResponse(strKey, strSecret, strPassPhrase, strUri, jsn);
			const rw = JSON.parse(result);
			if (!('Error' in rw) && rw['code'] && rw['code'] === '0') {
				rw['data'].forEach(od => {
					if (dtReply && od.ordId in dtReply) {
						if (od.sCode = '0') {
							//若currentState不存在會傳回-1，小於任何有效索引
							const currentState = dtReply[od.ordId]['state'];
							if (strState.indexOf(currentState) < strState.indexOf("canceling")) {
								dtReply[od.ordId]['state'] = "canceling";
							}
						} else {
							dtReply[od.clOrdId]['state'] = 'failed';
							dtReply[od.clOrdId]['sMsg'] = od.sMsg;
						}
					}
				});
			} else {
				console.log(result);
			}
		} else {
			console.log(jsn);
		}
	}
}

//調整放貸資金，boolIn為True表示增加放貸
async function moveMoney(amt, boolIn) {
	let strR = '';
	if (boolIn) {
		strR = await transfer(dicInfo.Key, dicInfo.Secret, dicInfo.PassPhrase, amt, false);
		await new Promise(resolve => setTimeout(resolve, 1200));
		strR += await finInOut(dicInfo.Key, dicInfo.Secret, dicInfo.PassPhrase, amt, true);
	} else {
		strR = await finInOut(dicInfo.Key, dicInfo.Secret, dicInfo.PassPhrase, amt, false);
		await new Promise(resolve => setTimeout(resolve, 1200));
		strR += await transfer(dicInfo.Key, dicInfo.Secret, dicInfo.PassPhrase, amt, true);
	}
	showAlert(strR);
}

//資金劃轉，boolC2T true是資金->交易，false是交易->資金
async function transfer(key, secret, passPhrase, amt, boolC2T) {
    const dic = {
        "ccy": "USDT",
        "type": "0",
        "amt": amt.toString(),
        "from": boolC2T ? "6" : "18",
        "to": boolC2T ? "18" : "6"
    };
    const strBodyJson = JSON.stringify(dic);
    const uri = "/api/v5/asset/transfer";
    try {
        const result = await postResponse(key, secret, passPhrase, uri, strBodyJson);
		const rw = JSON.parse(result);
		if (rw.code === '0') {
			rw.data.forEach(ord => {
				if (ord.ccy === "USDT") {
					const strM = `從${boolC2T ? "資金到交易" : "交易到資金"}轉${ord.amt}`;
					return strM;
				} else {
					return `transfer回傳${ord.ccy}不是USDT`;
				}
			});
		}
    } catch (error) {
        return `Error in transfer: ${error.message}`;
    }
}

//簡單賺幣購買和贖回 boolIn true是購買賺幣，false是贖回賺幣
// 購買和贖回
async function finInOut(key, secret, passPhrase, amt, boolIn) {
    const uri = "/api/v5/finance/savings/purchase-redempt";
    const dic = {
        "ccy": "USDT",
        "amt": amt.toString(),
        "side": boolIn ? "purchase" : "redempt",
        "rate": "0.01"
    };
    const strBodyJson = JSON.stringify(dic);
    try {
        const result = await postResponse(key, secret, passPhrase, uri, strBodyJson);
        const rw = JSON.parse(result);
        if (rw && rw.code === '0') {
            return `${If(boolIn, "增加", "減少")}放貸${amt}`;
        } else {
			return `FinInOut failed: ${result}`
		}
    } catch (error) {
        return `Error in finInOut: ${error.message}`;
    }
}

//GET Response
async function getResponse(strKey, strSecret, strPassPhrase, strUri, strPayload = "") {
    try {
        const timestamp = new Date().toISOString();
        strUri = strPayload === "" ? strUri : `${strUri}?${strPayload}`;
		const uri = "https://www.okx.com" + strUri;
        const headers = new Headers();
        headers.append('OK-ACCESS-KEY', strKey);
        headers.append('OK-ACCESS-TIMESTAMP', timestamp);
        headers.append('OK-ACCESS-PASSPHRASE', strPassPhrase);
        headers.append('OK-ACCESS-SIGN', getSignature(strSecret, `${timestamp}GET${strUri}`));
        const response = await fetch(uri, {
			method: 'GET',
			headers: headers,
		});
        const result = await response.text();
        if (response.ok) {
            return result;
        } else {
            return JSON.stringify({Error: 'response not ok', msg: result});
        }
    } catch (error) {
        return JSON.stringify({Error: 'fetch failed', msg: error.message});
    }
}

//POST Response
async function postResponse(strKey, strSecret, strPassPhrase, strUri, strBodyJson) {
    try {
        const timestamp = new Date().toISOString();
		const uri = "https://www.okx.com" + strUri;
        const headers = new Headers();
        headers.append('OK-ACCESS-KEY', strKey);
        headers.append('OK-ACCESS-TIMESTAMP', timestamp);
        headers.append('OK-ACCESS-PASSPHRASE', strPassPhrase);
        headers.append('Content-Type', 'application/json');
        headers.append('OK-ACCESS-SIGN', getSignature(strSecret, `${timestamp}POST${strUri}${strBodyJson}`));
        const response = await fetch(uri, {
            method: 'POST',
            headers: headers,
            body: strBodyJson
        });
        const result = await response.text();
        if (response.ok) {
            return result;
        } else {
            return JSON.stringify({Error: 'response not ok', msg: result});
        }
    } catch (error) {
        return JSON.stringify({Error: 'fetch failed', msg: error.message});
    }
}

//HmacSHA256加密
function getSignature(strSecret, signData) {
	const hash = CryptoJS.HmacSHA256(signData, strSecret);
	return CryptoJS.enc.Base64.stringify(hash);
}