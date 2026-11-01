function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // API とヘルスチェックは専用ビヘイビアで処理する。ここへ来ても書き換えない。
  if (uri === '/api' || uri.indexOf('/api/') === 0 || uri === '/health') {
    return request;
  }

  // 拡張子のあるパスはアセットとしてそのまま返す。
  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
  if (lastSegment.indexOf('.') !== -1) {
    return request;
  }

  request.uri = '/index.html';
  return request;
}
