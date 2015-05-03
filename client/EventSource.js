// 为那些不支持的浏览器模拟EventSource API
// 需要一个XMLHttpRequest对象在新数据写到长期存在的HTTP连接中时发送readystatechange事件
// 注意这不是完整的API
// 它不支持readyState属、close方法和error事件
// 消息事件也是通过onmessage属性注册的--还没有定义addEventListener方法
if (window.EventSource === undefined) {     // 如果EventSource未定义
    window.EventSource = function(url) {    // 像这样进行模拟
        var xhr;                        // HTTP连接器
        var evtsrc = this;              // 在事件处理程序中用到
        var charsReceived = 0;          // 我们可以知道哪些数据是新的
        var type = null;                // 检查属性响应类型
        var data = "";                  // 存放消息数据
        var eventName = "message";      // 事件对象的类型字段
        var lastEventId = "";           // 用于与服务器的再次同步
        var retrydelay = 1000;          // 在多个连接请求之间设置延时
        var aborted = false;            // 设为true表示放弃连接

        // 创建XHR对象
        xhr = new XMLHttpRequest(); 

        // 定义一个事件处理程序
        xhr.onreadystatechange = function() {
            switch(xhr.readyState) {
            case 3: processData(); break;   // 当数据库到达
            case 4: reconnect(); break;     // 当请求关闭
            }
        };

        // 创建一个长期存在的连接
        connect();

        // 如果连接正常关闭等待1秒再尝试连接
        function reconnect() {
            if (aborted) return;             // 终止连接后不再重复操作
            if (xhr.status >= 300) return;   // 发生错误后不再重复操作
            setTimeout(connect, retrydelay); // 等待1秒进行重连
        };

        // 这里的代码展示了如何建立连接
        function connect() {
            charsReceived = 0; 
            type = null;
            xhr.open("GET", url);
            xhr.setRequestHeader("Cache-Control", "no-cache");
            if (lastEventId) xhr.setRequestHeader("Last-Event-ID", lastEventId);
            xhr.send();
        }

        // 每次数据到达的时候会处理并触发onmessage处理程序
        // 这个函数处理Server-Send Events协议的细节
        function processData() {
            if (!type) {   // 如果没有准备好先检查响应类型
                type = xhr.getResponseHeader('Content-Type');
                if (type !== "text/event-stream") {
                    aborted = true;
                    xhr.abort();
                    return; 
                }
            }
            // 记录接收的数据
            // 获得响应中为处理的数据
            var chunk = xhr.responseText.substring(charsReceived);
            charsReceived = xhr.responseText.length;

            // 将大块文本数据分成多行并遍历他们
            var lines = chunk.replace(/(\r\n|\r|\n)$/, "").split(/\r\n|\r|\n/);
            for(var i = 0; i < lines.length; i++) {
                var line = lines[i], pos = line.indexOf(":"), name, value="";
                if (pos == 0) continue;               // 忽略注释
                if (pos > 0) {                        // 字段名称：值
                    name = line.substring(0,pos);
                    value = line.substring(pos+1);
                    if (value.charAt(0) == " ") value = value.substring(1);
                }
                else name = line;                     // 只有名称字段

                switch(name) {
                case "event": eventName = value; break;
                case "data": data += value + "\n"; break;
                case "id": lastEventId = value; break;
                case "retry": retrydelay = parseInt(value) || 1000; break; 
                default: break;  // 忽略其他行
                }

                if (line === "") {  // 一个空行就意味着发送事件
                    if (evtsrc.onmessage && data !== "") {
                        // 如果末尾有新行就剪裁新行
                        if (data.charAt(data.length-1) == "\n")
                            data = data.substring(0, data.length-1);
                        evtsrc.onmessage({    // 伪造的事件对象
                            type: eventName,  // 事件类型
                            data: data,       // 时间数据
                            origin: url       // 数据源
                        });
                    }
                    data = "";
                    continue;
                }
            }
        }
    };
}
