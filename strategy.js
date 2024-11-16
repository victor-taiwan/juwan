let dicInfo = {};
let dicCapital = {};
let dicParameters = {};
let dtReply = {};	//名為dtReply，但因有primary key, 故實為dic
let dtStrategy = [];
let intClOrdId = 1;
// 用來記錄 last 和 datR 的狀態，datR給總資金變化、totalLimit共享
const checkTotalAndDate = (function() {
    let last = dicCapital.total;
    let datR = new Date(new Date().getTime() - 12 * 1000);
    return function(callback) {
        let result = callback(last, datR);
        last = result.last;
        datR = result.datR;
    };
})();


//檢查風險
function checkRisk() {
    if (dicCapital.usdt > 0 && dtStrategy.length > 0) { // 有資金有策略才檢查風控
        // 總上限、震幅限和個別 hold 上下限
		const totalLimit = parseFloat(dicParameters.TotalLimit);
        if (Math.abs(dicCapital.position) / dicCapital.total > totalLimit) {
            totalLimitMove(); // 冷卻時間180秒在裡面設定
        } else { // 未觸發總上限，再檢查個別的震幅限和 hold 上下限
            dtStrategy.forEach(function(drS) {
                // 檢查單一策略 drS 的風控（震幅限與 hold 上下限）
                checkSingle(drS);
            });
        }

        // 總資金回檔
		const minusStop = parseFloat(dicParameters.MinusStop);
        if (dicCapital.total / dicCapital.day_ago < minusStop) {
            cancelAll('All');	//全刪單，
			document.getElementById('startWork').checked = false;
			showAlert('總資金單日劇烈回檔，全刪單並取消勾選「開始運作」');
        }

        // 資金變化時，重新下單，以調整委託量(設有21秒冷卻時間)
        checkTotalAndDate(function(last, datR) {
            if ((new Date() - datR) / 1000 > 21) {
                // 總資金變化量超過（總部位比例 * 0.02）進行重送策略
                if (Math.abs(dicCapital.total / last - 1) > Math.max(0.01, dicCapital.position / dicCapital.total * 0.02)) {
                    last = dicCapital.total;
                    datR = new Date();
                    dtStrategy.forEach(drS => startStrategy(drS.name)); // startStrategy 的一開始會 Call CancelAll(drS["strategy"])
                }
            }
            return { last, datR };
        });

        // 放貸是否調整（直接到程序裡檢查），會被CORS擋住，暫不處理
        //checkFinance(); // 這是異步程序，未等完成就會結束 checkRisk
    }
}

//觸及總上限，冷卻時間11秒
function totalLimitMove() {
	checkTotalAndDate(function(last, datR) {
		if((new Date() - datR) / 1000 > 11) {
			clearInv('All', parseFloat(dicParameters.Clear));
			dtStrategy.forEach(drS => {
				const minLeverage = parseFloat(dicParameters.MinTotalL) / dtStrategy.length;
				const cutLeverage = parseFloat(dicParameters.CutLeverage);
				drS.leverage = Math.max(minLeverage, drS.leverage * cutLeverage);
				startStrategy(drS.name);
			});
			datR = new Date();
			last = dicCapital.total;
			showAlert(`觸發總上限, position=${dicCapital.position}, total=${dicCapital.total}`)
		}
		return {last, datR};
	});
}

//檢查單一策略drS的風控: 震幅限，個別hold上下限****真正的啟動下單在ratioHL裡的startStrategy
function checkSingle(drS) {
    // 震幅限
    var marketRow = dtMarket[drS.name];
    var sngRatioHL = marketRow ? marketRow.ratioHL : 0;
    var boolActiveReply = Object.values(dtReply).some(reply => reply.instId === drS.name 
		&& reply.clOrdId.length >= 10);
    if (sngRatioHL > parseFloat(dicParameters.hlLimit)) { // 觸發震幅限停止下單
        if (boolActiveReply) {
			cancelAll(drS.name);
			showAlert(`${drS.name}觸發震幅限, ratioHL=${sngRatioHL}`);
		}
    } else {
        // 在 ratioHL 之內，有勾 Active，又沒有委託單，就當做是從大震盪回來，啟動策略下單
        if (document.getElementById('startWork').checked 
		&& drS.active.toLowerCase() === 'true' 
		&& !boolActiveReply
		) {
            startStrategy(drS.name);
        }
    }

    // 個別 hold 上下限
    var holdRatio = drS.hold / dicCapital.total;
    if (holdRatio > +drS.hold上限 || holdRatio < +drS.hold下限) {
		checkTotalAndDate(function(last, datR) {
			if((new Date() - datR) / 1000 > 11) {
				const minLeverage = parseFloat(dicParameters.MinTotalL) / dtStrategy.length;
				const cutLeverage = parseFloat(dicParameters.CutLeverage);
				drS.leverage = Math.max(minLeverage, drS.leverage * cutLeverage);
				clearInv(drS.name, +dicParameters.Clear);
				startStrategy(drS.name);
				showAlert(`${drS.name}觸發hold${holdRatio > +drS.hold上限 ? '上' : '下'}限`);
				datR = new Date();
			}
			return {last, datR};
		});
    }
}

//檢查資金與調整放貸，冷卻時間31秒
function checkFinance() {
	checkTotalAndDate(function (last, datR) {
		if ((new Date() - datR) / 1000 > 31) {
			const moneyRatio = dicCapital.avail / dicCapital.total;
			const availRatioUp = parseFloat(dicParameters.AvailRatioU);
			const availRatioDown = parseFloat(dicParameters.AvailRatioDown);
			if (moneyRatio > AvailRatioUp || moneyRatio < availRatioDown) {
				const center = dicCapital.total * (availRatioUp + availRatioDown) / 2;
				const amt = parseInt(dicCapital.avail - center);
				moveMoney(Math.abs(amt), amt > 0);	//okx裡的轉移資金
				datR = new Date();
			}
		}
		return {last, datR};
	});
}

//按比例清除庫存，（現有 - 中心) * Clear / price
function clearInv(instId, Clear) {
	const drSs = dtStrategy.filter(dr => dr.name === instId || instId === 'All');
	if (drSs.length > 0) {
		//進行清倉前先取得市場最新報價，okxMarket程序裡有設定1秒冷卻時間
		okxMarket();
		const ods = drSs.map(drS => {
			const price = dtMarket[drS.name].price;
			const center = +dicParameters.TotalLong / dtStrategy.length;	//預設起點
			const vol = drS.hold - dicCapital.total * center;	//距起點
			const side = vol > 0 ? 'sell' : 'buy';
			const px = price * (side === 'sell' ? 0.985 : 1.015);
			const sz = Math.abs(vol / price) * Clear;	//vol計算出是金額，要除以price才是數量
			const od = makeOrder(drS.name, 'xxxx', side, px, sz);
			addReply(od.clOrdId, od.instId, side, px, sz, 'new', od.clOrdId);
			return od;
		});
		sendOrder(ods);
	}
}

//成交後動作，傳來的是dtReply[od.ordId]，也就是除了ordId以外的所有資訊{}
function orderFilled(drR) {
	if (drR.clOrdId.length < 10) return;	//策略單的clOrdId是10
	const drS = dtStrategy.find(item => item.name === drR.instId);
	if (drS && drS.active.toLowerCase() === 'true' && document.getElementById('startWork').checked) {
		const priceR = parseFloat(drR.px);
		const intR = parseInt(drR.clOrdId.slice(-4));	//clOrdId tail as strategy seq.
		const ordersN = parseInt(drS['單數']);
		//取消一個反向遠單，2024-7-24：要下單的位置可能有舊單也刪掉，原因應該是webSocket中斷錯亂
		const tar = [];	//要刪單的clOrdId，反向遠單[ordersN+1]，（反向近單[1]，同向遠單[ordersN]）再補下
		if (drR.side === 'buy') {
			tar.push(intR + (ordersN + 1), intR - ordersN, intR + 1);
		} else {
			tar.push(intR - (ordersN + 1), intR + ordersN, intR - 1);
		}
		const cancelList = Object.entries(dtReply).filter(([, data]) => {
			if (data.clOrdId.length < 10 || data.instId !== drR.instId) {
				return false;
			} else {
				return tar.includes(parseInt(data.clOrdId.slice(-4)));
			}
		}).map(([ordId, data]) => ({ordId, instId: data.instId}));
		cancelOrder(cancelList);
		//下反向近單[1]與同向遠單[ordersN]
		const volR = dicCapital.total * drS.leverage * 0.5 / priceR;
		const ods = [-1, 1].map(j => {
			const side = j === -1 ? 'buy' : 'sell';
			const i = side === drR.side ? ordersN : 1;
			[p, v] = seqOrder(i, j, priceR, volR, parseFloat(drS['歩差']));
			const clOrdId = (intR + i * j).toString().padStart(4, '0');
			const od = makeOrder(drR.instId, clOrdId, side, p, v);
			addReply(od.clOrdId, od.instId, od.side, od.px, od.sz, "new", od.clOrdId);
			return od;
		});
		sendOrder(ods);
	}
}

//開始策略：先取得市場表、取消原有單，再重啟
function startStrategy(instId) {
	//非工作狀態跳出
	if (!document.getElementById('startWork').checked) return;

	const drS = dtStrategy.find(item => item.name === instId);
	// 勾选Active进行启动下单
	if (drS && drS.active.toLowerCase() === 'true') {
		cancelAll(instId);
		//開始前先更新報價，okxMarket設定1秒內不連續觸發
		okxMarket();
		if (instId in dtMarket && dtMarket[instId].state === 'live') {
			//大於震幅限跳出
			const drM = dtMarket[instId];
			const sngRatioHL = drM ? drM.ratioHL : 0;
			if (sngRatioHL > dicParameters.hlLimit) return;

			const intR = Math.round(Math.log(drM.price) / Math.log(1 + parseFloat(drS.歩差))); // 当前价格是(1+r)的？次方
			const volR = dicCapital.total * drS.leverage * 0.5 / drM.price; // 基准量
			const lstOrder = [];

			for (let i = 1; i <= parseInt(drS.單數); i++) {
				for (let j of [-1, 1]) { // -1下买单，1下卖单
					const side = (j === -1) ? "buy" : "sell";
					const [p, v] = seqOrder(i, j, drM.price, volR, parseFloat(drS.歩差));
					const clOrdId = (intR + i*j + 5000).toString().padStart(4, '0');
					const od = makeOrder(instId, clOrdId, side, p, v);
					addReply(od.clOrdId, instId, side, od.px, od.sz, "new", od.clOrdId);
					lstOrder.push(od);
				}
			}
			sendOrder(lstOrder);
		}
	}
}

//把新訂單加到dtReply
function addReply(ordId, instId, side, px, sz, state, clOrdId) {
	//訂單不在dtReply或state較小才Update
	if (!(ordId in dtReply) || strState.indexOf(dtReply[ordId].state) < strState.indexOf(state)) {
		dtReply[ordId] = {instId, side, px, sz, state, clOrdId};
	}
}

//依上下順序給定價量，i是順序，j是上下
function seqOrder(i, j, priceR, volR, r) {
    let pv = [];
    pv[0] = priceR * Math.pow(1 + r, i * j);
    let sngVolStep = (1 + 0.5 * r) / (1 + r);
    pv[1] = volR * Math.pow(sngVolStep, i * j) * (1 - Math.pow(sngVolStep, -j)) * -j;
    return pv;
}

//依代入商品名刪單，代入All全刪
function cancelAll(instId) {
	let drRs = Object.entries(dtReply).filter(([, data]) => 
		['sent', 'live', 'partially_filled'].includes(data.state) && data.clOrdId.length >= 10);
	if (instId !== 'All') {
		drRs = drRs.filter(([, data]) => data['instId'] === instId);
	}
	const cancelList = drRs.map(([ordId, data]) => ({
		instId: data['instId']
		, ordId: ordId
	}));
	cancelOrder(cancelList);
	//非有效單直接移除
	Object.entries(dtReply).forEach(([ordId, data]) => {
		if (!['sent', 'live', 'partially_filled'].includes(data.state)) {
			if (instId === 'All' || data.instId === instId) {
				delete dtReply[ordId];
			}
		}
	});
}

//產生訂單，px和sz沒有用+運算，用*或/會自動轉數字，所以代入文字數字都可以
function makeOrder(instId, clOrdId, side, px, sz) {
	if (instId in dtMarket) {
		const increment = dtMarket[instId]['increment'];
		const ctVal = dtMarket[instId]['ctVal'];
	// 调整价格
		if (side === 'buy') {
			px = Math.floor(px / increment) * increment;
		} else if (side === 'sell') {
			px = Math.ceil(px / increment) * increment;
		} else {
			console.log(`adjustPV: wrong side string ${side}`);
		}

	// 调整大小
        sz = Math.max(1, Math.floor(sz / ctVal));
	}
    // 创建订单对象
	const strClOrdId = (intClOrdId++ % 1000000).toString().padStart(6,'0');
    const od = {
        instId: instId,
        tdMode: "cross",
        clOrdId: `${strClOrdId}${clOrdId}`,
        tag: "cce88b5c6506BCDE",
        side: side,
        ordType: "limit",
        px: floatToString(px),
        sz: floatToString(sz)
    };
	return od;
}

//送出訂單（批量）
function sendOrder(ods) {
	if (navigator.onLine) {
		if (wsUserData && wsUserData.readyState === WebSocket.OPEN) {
			wsOrder(ods);	//wsUserData有連線，用wsUserData送單
		} else {
			//wsUserData沒連線，用httpRequest送單
			postOrder(dicInfo.Key, dicInfo.Secret, dicInfo.PassPhrase, ods);
		}
	} else {
		showAlert('送單失敗, 網路斷線');
	}
}

//取消訂單（批量）
function cancelOrder(ods) {
	if (navigator.onLine) {
		if (ods.length > 0) {
			if (wsUserData && wsUserData.readyState === WebSocket.OPEN) {
				wsCancel(ods);	//wsUserData有連線，用wsUserData送單
			} else {
				postCancel(dicInfo.Key, dicInfo.Secret, dicInfo.PassPhrase, ods);	//wsUserData沒連線，用httpRequest送單
			}
		}
	} else {
		showAlert('刪單失敗, 網路斷線');
	}
}
