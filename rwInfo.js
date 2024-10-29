//把Info寫到雲端，並加入list
async function hWriteInfo() {
	showAlert(await writeInfo());
}
async function writeInfo() {
	//API config沒有trade權限，不準上傳
	const okx = await readOkx();
	if (okx['Error'] !== undefined || okx['code'] === undefined || okx['code'] !== '0') {return '沒有資料';}
	if (!okx['data'][0]['perm'].split(',').includes('trade')) {return '沒有交易權限';}

	dicInfo = rwInfo_info();
	dicParameters = rwInfo_parameters();
	dtStrategy = rwInfo_strategy();
	const dicInput = {
		Info: dicInfo
		, Parameters: dicParameters
		, Strategy: dtStrategy
	};
	const dic = {
		tolist: "true",
		input: JSON.stringify([JSON.stringify(dicInput)])
	};
    const formData = new URLSearchParams(dic);
    const uri = `userInfo.php`;

    try {
        const response = await fetch(uri, {
            method: 'POST',
            body: formData,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 30000 // 30 seconds timeout
        });
        const strR = await response.text();
		const rw = JSON.parse(strR);
		return strR;
    } catch (error) {
        return `Error: ${error}`;
    }
}
//make dicInfo
function rwInfo_info() {
	return {
		UID: document.getElementById('uid').textContent
		, Label: document.getElementById('label').textContent
		, Key: document.getElementById('key').value
		, Secret: document.getElementById('secret').value
		, PassPhrase: document.getElementById('passPhrase').value
	};
}
//make dicParameters
function rwInfo_parameters() {
	const tds = document.querySelectorAll('table#parameters tbody tr td');
	const para = {};
	tds.forEach(td => para[td.id] = td.textContent);
	return para;
}
//make dtStrategy
function rwInfo_strategy() {
	const strategy = [];
	document.querySelectorAll('table#strategy tbody tr').forEach(row => {
		const stra = row.getElementsByTagName('td');
		strategy.push({
			name: stra[0].textContent
			, active: String(stra[1].querySelector('input[type="checkbox"]').checked)
			, leverage: stra[2].textContent
			, '歩差': stra[3].textContent
			, '單數': stra[4].textContent
			, 'hold上限': stra[5].textContent
			, 'hold下限': stra[6].textContent
		});
	});
	return strategy;
}

//讀取Info
async function readInfo() {
    // User Info, parameters, strategy
    dicInfo = rwInfo_info();
    // Send to get information
    const dic = {
        Info: JSON.stringify(dicInfo)
    };

    const formData = new URLSearchParams(dic);
    const uri = `readInfo.php`;

    try {
        const response = await fetch(uri, {
            method: 'POST',
            body: formData,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 30000 // 30 seconds timeout
        });

        const strR = await response.text();
		const info = JSON.parse(strR);
		//寫入parameters
		Object.entries(info.Parameters).forEach(([id, text]) => {
			document.getElementById(id).textContent = text;
		});
		dicParameters = info.Parameters;	//重置dicParameters
		//寫入strategy之前先清空
		document.querySelector('#strategy tbody').innerHTML = '';
		info.Strategy.forEach(async strategy => {
			addStrategy(strategy["name"], String(strategy['active']), strategy["leverage"], strategy["歩差"], strategy["單數"], strategy["hold上限"], strategy["hold下限"]);
			await new Promise(resolve => setTimeout(resolve, 2000));
		});
		dtStrategy = info.Strategy;	//重置dtStrategy
    } catch (error) {
        console.error('Error:', error);
    }
}

//讀取本機儲存的帳密檔案
function readIDPW(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
			const idpw = JSON.parse(e.target.result);
			['key', 'secret', 'passPhrase'].forEach(item => {
				if (item in idpw) document.getElementById(item).value = idpw[item];
			});
        };
        reader.readAsText(file);
    }	
}

//讀取本機儲存的參數策略檔案
function readParaStra(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const ps = JSON.parse(e.target.result);
			//處理並寫入參數
			Object.entries(ps.Parameters).forEach(([key, text]) => {
				document.getElementById(key).textContent = text;
			});
			dicParameters = ps.Parameters;	//設定dicParameters
			
			//寫入strategy之前先清空
			document.querySelector('#strategy tbody').innerHTML = '';
			ps.Strategy.forEach(async strategy => {
				addStrategy(strategy["name"], String(strategy['active']), strategy["leverage"], strategy["歩差"], strategy["單數"], strategy["hold上限"], strategy["hold下限"]);
				await new Promise(resolve => setTimeout(resolve, 2000));
			});
			dtStrategy = ps.Strategy;	//設定dtStrategy
        };
        reader.readAsText(file);
    }	
}

//寫出帳密
function writeIDPW() {
	const strKey = document.getElementById('key').value;
	const strSecret = document.getElementById('secret').value;
	const strPassPhrase = document.getElementById('passPhrase').value;
	let label = document.getElementById('label').textContent;
	label = (label === '') ? 'idpw' : label;
    const text = JSON.stringify({key: strKey, secret: strSecret, passPhrase: strPassPhrase});
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${label}.txt`;
    document.body.appendChild(a);
    a.click();

    // 释放 URL 对象
    URL.revokeObjectURL(url);
    document.body.removeChild(a);	
}

//寫出參數策略
function writeParaStra() {
	let label = document.getElementById('label').textContent;
	label = (label === '') ? 'idpw' : label;
	dicParameters = rwInfo_parameters();	//重設dicParameters
	dtStrategy = rwInfo_strategy();		//重設dtStrategy
    const text = JSON.stringify({
		Parameters: dicParameters
		, Strategy: dtStrategy
	});
    const blob = new Blob([text], { type: 'text/plain' });
	const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${label}_ParaStra.txt`;
    document.body.appendChild(a);
    a.click();

    // 释放 URL 对象
    URL.revokeObjectURL(url);
    document.body.removeChild(a);	
}
