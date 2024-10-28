let wsUserData = null;
let reconnectAttempts = -2;
let timerPing = null;
const maxReconnectAttempts = 10;
const strState = ["wait", "new", "sent", "live", "partially_filled", "canceling", "canceled", "mmp_canceled", "filled", "failed"];
let intSend = 0;	//送單id

//檢查wsUserData是否連線
function checkWebSocket() {
	if (document.getElementById('startWork').checked) {
		if (!wsUserData || wsUserData.readyState !== WebSocket.OPEN) {
			onClose({});	//onClose事件中會再次檢查startWork有無勾選
		}
	}
}

//創建wsUserData
function createWsUserData() {
	if (!wsUserData) {
		wsUserData = new WebSocket("wss://ws.okx.com:8443/ws/v5/private");
		wsUserData.onopen = onOpen;
		wsUserData.onmessage = onMessage;
		wsUserData.onerror = onError;
		wsUserData.onclose = onClose;
	}
}

//連結時設定時送ping，驗證verify
function onOpen(event) {
	reconnectAttempts = -2; // 重置重连尝试次数
	//定時送ping
	heartBeat();
	//驗證
	const timestamp = Math.floor(Date.now() / 1000).toString();
    const dic = {
        apiKey: dicInfo.Key,
        passphrase: dicInfo.PassPhrase,
		timestamp: timestamp,
		sign: getSignature(dicInfo.Secret, `${timestamp}GET/users/self/verify`)
	};
	const lst = [dic];
    if (wsUserData.readyState === WebSocket.OPEN) {
        wsUserData.send(socketString('login', lst));
    }
}

//定時送ping
function heartBeat() {
	if (window.Worker) {
		timerPing = new Worker('timerWorker.js');
		timerPing.onmessage = function(event) {
			if (event.data === 'dingDong') {
				if (wsUserData.readyState === WebSocket.OPEN) {
					wsUserData.send('ping');
					timerPing.postMessage(25000);
				}
			}
		};
		timerPing.postMessage(25000);
	} else {
		timerPing = setInterval(() => {
			if (wsUserData.readyState === WebSocket.OPEN) {
					wsUserData.send('ping');
			}
		}, 25000);
	}
}

//收到訊息：login, orderSent, cancelSent, orders
function onMessage(event) {
	if (event.data !== 'pong') {
		try {
			const data = JSON.parse(event.data);
			if ('event' in data) {			//有event是登入、訂閱成功或失敗
				switch (data.event) {
					case 'login':
						if (data['code'] === '0') {	//若是登入，訂閱訂單頻道
							const lst = [{channel: 'orders', instType: 'SWAP'}];
							if (wsUserData.readyState === WebSocket.OPEN) {
								wsUserData.send(socketString('subscribe', lst));
							}
						}
						break;
					case 'subscribe':
					case 'unsubscribe':
						//if (data.arg.channel === 'orders') showAlert('訂單頻道訂閱成功');
						break;
				}	
			} else if ('op' in data) {		//有op是WS下單與刪單
				switch (data["op"]) {
					case "order":
					case "batch-orders":
						//不調用，以compareReply除錯，cancel同
						//if (data.code !== '0') data['data'].forEach(orderSent);
						break;
					case "cancel-order":
					case "batch-cancel-orders":
						//if (data.code !== '0') data['data'].forEach(cancelSent);
						break;
					default:
						// Handle default case if needed
						break;
				}
			} else if ('arg' in data && 'channel' in data['arg']) {		//沒有event和op，arg中有channel，為帳務、庫存和訂單回報
				switch (data["arg"]["channel"]) {
					case "orders":
						if (data['arg']['uid'] === document.getElementById('uid').textContent) {
							data['data'].forEach(orders);
						}
						break;
					case "account":
						break;
					case "positions":
						break;
				}
			}
		} catch (error) {
			console.error("onMessage Error:", error);
		}
	}
}

//訂單送出<--不調用了，不然一直送錯就卡住，有compareReply除錯
function orderSent(od) {
	//回傳sCode非'0'為失敗，等2秒再送一次
	if (od.sCode !== '0') {
		console.log(od);
		if (window.Worker) {
			let timerWorker = new Worker('timerWorker.js');
			timerWorker.onmessage = function(event) {
				if (event.data === 'dingDong') {
					const drR = dtReply[od.clOrdId];
					if (drR) {
						const o = makeOrder(drR.instId, drR.clOrdId.slice(-4), drR.side, drR.px, drR.sz);
						sendOrder([o]);
					}
					delete drR;
				}
				timerWorker.terminate();
				timerWorker = null;
			};
			timerWorker.postMessage(2000);
		}
	}
}

//刪單送出<--不調用了，不然一直送錯就卡住，有compareReply除錯
function cancelSent(od) {
	if (od.sCode !== '0') {
		console.log(od);
		new Promise(resolve => setTimeout(resolve, 2000)).then(() => {
			const drR = dtReply[od.ordId];	//不含ordId的對象{}
			if (drR) {
				cancelOrder([{instId: drR.instId, ordId: od.ordId}]);
			}
		});
	}
}

//收到訂單回報
function orders(od) {
	if (dtReply) {
		//有clOrdId訂單改成ordId
		if (od.clOrdId in dtReply && !(od.ordId in dtReply)) {
			dtReply[od.ordId] = dtReply[od.clOrdId];
			delete dtReply[od.clOrdId];
		}
		if (!(od.ordId in dtReply)) dtReply[od.ordId] = {};	//沒有訂單新增一個
		//簡單填入的資訊
		['instId', 'side', 'px', 'clOrdId'].forEach(item => {
			dtReply[od.ordId][item] = od[item];
		});
		//成交就以最新成交價更新市場報價
		if (od['state'] === 'filled' && od['fillPx'] && od['fillPx']>0) {
			if (dtMarket[od.instId]) dtMarket[od.instId]['price'] = +od['fillPx'];
		}
		const currentState = dtReply[od.ordId]['state'];
		//若currentState不存在會傳回-1，小於任何有效索引
		if (strState.indexOf(currentState) < strState.indexOf(od.state)) {
			dtReply[od.ordId]['state'] = od.state;
		}
		//sz類要計算合約表彰幣數ctVal
		['sz', 'accFillSz'].forEach(item => {
			const val = dtMarket[od.instId] ? dtMarket[od.instId]['ctVal'] : 1;
			const vol = floatToString(parseInt(od[item]) * val);
			dtReply[od.ordId][item] = vol;
		});
		//時間轉換格式字串
		const cTime = formatTimestamp(parseInt(od.cTime));
		dtReply[od.ordId]['cTime'] = cTime;
		
		//根據state做動作
		switch (dtReply[od.ordId].state) {
			case 'canceled':
			case 'mmp_canceled':
				delete dtReply[od.ordId];
				break;
			case 'filled':
				orderFilled(dtReply[od.ordId]);
				delete dtReply[od.ordId];
				break;
			default:
				break;
		}

		//延遲一秒重置回報表
		delayReply();
	}
}

//錯誤訊息
function onError(event) {
	console.error("WebSocket error observed:", event);
}

//斷線，在勾取「開始運作」狀態自動重連
function onClose(e) {
	//停止Ping
	if (timerPing && window.Worker) {
		timerPing.terminate();
	} else {
		clearInterval(timerPing);
	}
	timerPing = null;
	wsUserData = null;
	//有勾運作，重啟連線
	if (document.getElementById('startWork').checked) {
		//showAlert("WebSocket connection closed. Reconnecting...");
		if (reconnectAttempts < maxReconnectAttempts) {
            let reconnectDelay = Math.pow(2, reconnectAttempts) * 1000; // 指数退避策略
            reconnectAttempts++;
			//用window.Worker重啟，不受背景執行影響
			if (window.Worker) {
				let timerWorker = new Worker('timerWorker.js');
				timerWorker.onmessage = function(event) {
					if (event.data === 'dingDong') {
						createWsUserData();
					}
					//清除timerWorker
					timerWorker.terminate();
					timerWorker = null;
				};
				timerWorker.postMessage(reconnectDelay);
			} else {
				setTimeout(createWsUserData, reconnectDelay);
			}
        } else {
            showAlert("Max reconnect attempts reached. Giving up.");
        }
	} else {
		showAlert('WebSocket Closed.');
	}
}

//WebSocket送單
function wsOrder(ods) {
	for (let i = 0; i <= Math.floor((ods.length - 1) / 20); i++) {
		const lstS = ods.slice(i * 20, i * 20 + 20);	// 要送出的list
		const dicSend = {
			id: intSend++,
			op: "batch-orders",
			args: lstS
		};
		const jsn = JSON.stringify(dicSend);
		if (document.getElementById('startWork').checked) {
			wsUserData.send(jsn);
		} else {
			console.log(jsn);
	    }
	}
}

//WebSocket刪單
function wsCancel(ods) {
	for (let i = 0; i <= Math.floor((ods.length - 1) / 20); i++) {
		const lstS = ods.slice(i * 20, i * 20 + 20);	// 要送出的list
		const dicSend = {
			id: intSend++,
			op: "batch-cancel-orders",
			args: lstS
		};
		const jsn = JSON.stringify(dicSend);
		if (document.getElementById('startWork').checked) {
			wsUserData.send(jsn);
		} else {
			console.log(jsn);
	    }
	}
}

// 建立websocket subscribe字串
function socketString(type, params) {
	const dic = {
		op: type,
		args: params
	};
	return JSON.stringify(dic);
}

