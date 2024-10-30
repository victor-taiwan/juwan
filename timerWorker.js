self.onmessage = function(event) {
	setTimeout(() => {
		self.postMessage('dingDong');
	}, event.data);
};
