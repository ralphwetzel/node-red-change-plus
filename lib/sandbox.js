
let util = require("util");
let vm = require("vm");

let node;
let RED;

function createVMOpt(node, kind) {
    var opt = {
        filename: 'Function node'+kind+':'+node.id+(node.name?' ['+node.name+']':''), // filename for stack traces
        displayErrors: true
        // Using the following options causes node 4/6 to not include the line number
        // in the stack output. So don't use them.
        // lineOffset: -11, // line number offset to be used for stack traces
        // columnOffset: 0, // column number offset to be used for stack traces
    };
    return opt;
}

// let functionText = "var results = null;"+
// //"results = (async function(msg,__send__,__done__){ "+
// "results = (async function(msg){ "+
//     // "var __msgid__ = msg._msgid;"+
//     "var node = {"+
//         "id:__node__.id,"+
//         "name:__node__.name,"+
//         "path:__node__.path,"+
//         // "outputCount:__node__.outputCount,"+
//         "log:__node__.log,"+
//         "error:__node__.error,"+
//         "warn:__node__.warn,"+
//         "debug:__node__.debug,"+
//         "trace:__node__.trace,"+
//         // "on:__node__.on,"+
//         "status:__node__.status,"+
//         // "send:function(msgs,cloneMsg){ __node__.send(__send__,__msgid__,msgs,cloneMsg);},"+
//         // "done:__done__"+
//     "};\n"+
//     node.func+"\n"+
// "})(msg,__send__,__done__);";


// if (util.hasOwnProperty('promisify')) {
//     sandbox.setTimeout[util.promisify.custom] = function(after, value) {
//         return new Promise(function(resolve, reject) {
//             sandbox.setTimeout(function(){ resolve(value); }, after);
//         });
//     };
//     sandbox.promisify = util.promisify;
// }

// let processMessage = function (msg, send, done) {
//     var start = process.hrtime();
//     context.msg = msg;
//     context.__send__ = send;
//     context.__done__ = done;    
//     var opts = {};
//     if (node.timeout>0){
//         opts = node.timeoutOptions;
//     }
//     node.script.runInContext(context,opts);
//     context.results.then(function(results) {
//         sendResults(node,send,msg._msgid,results,false);
//         if (handleNodeDoneCall) {
//             done();
//         }

//         var duration = process.hrtime(start);
//         var converted = Math.floor((duration[0] * 1e9 + duration[1])/10000)/100;
//         node.metric("duration", msg, converted);
//         if (process.env.NODE_RED_FUNCTION_TIME) {
//             node.status({fill:"yellow",shape:"dot",text:""+converted});
//         }
//     }).catch(err => {
//         if ((typeof err === "object") && err.hasOwnProperty("stack")) {
//             //remove unwanted part
//             var index = err.stack.search(/\n\s*at ContextifyScript.Script.runInContext/);
//             err.stack = err.stack.slice(0, index).split('\n').slice(0,-1).join('\n');
//             var stack = err.stack.split(/\r?\n/);

//             //store the error in msg to be used in flows
//             msg.error = err;

//             var line = 0;
//             var errorMessage;
//             if (stack.length > 0) {
//                 while (line < stack.length && stack[line].indexOf("ReferenceError") !== 0) {
//                     line++;
//                 }

//                 if (line < stack.length) {
//                     errorMessage = stack[line];
//                     var m = /:(\d+):(\d+)$/.exec(stack[line+1]);
//                     if (m) {
//                         var lineno = Number(m[1])-1;
//                         var cha = m[2];
//                         errorMessage += " (line "+lineno+", col "+cha+")";
//                     }
//                 }
//             }
//             if (!errorMessage) {
//                 errorMessage = err.toString();
//             }
//             done(errorMessage);
//         }
//         else if (typeof err === "string") {
//             done(err);
//         }
//         else {
//             done(JSON.stringify(err));
//         }
//     });
// }

let evaluate = async function(_RED, _node, func, msg, done) {

    node = _node;
    RED = _RED;
    
    let sandbox = {
        console:console,
        util:util,
        Buffer:Buffer,
        Date: Date,
        RED: {
            util: RED.util
        },
        __node__: {
            id: node.id,
            name: node.name,
            path: node._path,
            // outputCount: node.outputs,
            log: function() {
                node.log.apply(node, arguments);
            },
            error: function() {
                node.error.apply(node, arguments);
            },
            warn: function() {
                node.warn.apply(node, arguments);
            },
            debug: function() {
                node.debug.apply(node, arguments);
            },
            trace: function() {
                node.trace.apply(node, arguments);
            },
            // send: function(send, id, msgs, cloneMsg) {
            //     sendResults(node, send, id, msgs, cloneMsg);
            // },
            // on: function() {
            //     if (arguments[0] === "input") {
            //         throw new Error(RED._("function.error.inputListener"));
            //     }
            //     node.on.apply(node, arguments);
            // },
            status: function() {
                node.clearStatus = true;
                node.status.apply(node, arguments);
            }
        },
        context: {
            set: function() {
                node.context().set.apply(node,arguments);
            },
            get: function() {
                return node.context().get.apply(node,arguments);
            },
            keys: function() {
                return node.context().keys.apply(node,arguments);
            },
            get global() {
                return node.context().global;
            },
            get flow() {
                return node.context().flow;
            }
        },
        flow: {
            set: function() {
                node.context().flow.set.apply(node,arguments);
            },
            get: function() {
                return node.context().flow.get.apply(node,arguments);
            },
            keys: function() {
                return node.context().flow.keys.apply(node,arguments);
            }
        },
        global: {
            set: function() {
                node.context().global.set.apply(node,arguments);
            },
            get: function() {
                return node.context().global.get.apply(node,arguments);
            },
            keys: function() {
                return node.context().global.keys.apply(node,arguments);
            }
        },
        env: {
            get: function(envVar) {
                return RED.util.getSetting(node, envVar);
            }
        },
        setTimeout: function() {},
        clearTimeout: function() {},
        setInterval: function() {},
        clearInterval: function() {}
        // setTimeout: function () {
        //     var func = arguments[0];
        //     var timerId;
        //     arguments[0] = function() {
        //         sandbox.clearTimeout(timerId);
        //         try {
        //             func.apply(node,arguments);
        //         } catch(err) {
        //             node.error(err,{});
        //         }
        //     };
        //     timerId = setTimeout.apply(node,arguments);
        //     node.outstandingTimers.push(timerId);
        //     return timerId;
        // },
        // clearTimeout: function(id) {
        //     clearTimeout(id);
        //     var index = node.outstandingTimers.indexOf(id);
        //     if (index > -1) {
        //         node.outstandingTimers.splice(index,1);
        //     }
        // },
        // setInterval: function() {
        //     var func = arguments[0];
        //     var timerId;
        //     arguments[0] = function() {
        //         try {
        //             func.apply(node,arguments);
        //         } catch(err) {
        //             node.error(err,{});
        //         }
        //     };
        //     timerId = setInterval.apply(node,arguments);
        //     node.outstandingIntervals.push(timerId);
        //     return timerId;
        // },
        // clearInterval: function(id) {
        //     clearInterval(id);
        //     var index = node.outstandingIntervals.indexOf(id);
        //     if (index > -1) {
        //         node.outstandingIntervals.splice(index,1);
        //     }
        // }
    };
        
    
    
    
    let context = vm.createContext(sandbox);
    context.msg = msg;

    // func = "return (" + func + ")";

    // let functionText = "var results = null;"+
    // //"results = (async function(msg,__send__,__done__){ "+
    // "results = (async function(msg){ "+
    //     // "var __msgid__ = msg._msgid;"+
    //     "var node = {"+
    //         "id:__node__.id,"+
    //         "name:__node__.name,"+
    //         "path:__node__.path,"+
    //         // "outputCount:__node__.outputCount,"+
    //         "log:__node__.log,"+
    //         "error:__node__.error,"+
    //         "warn:__node__.warn,"+
    //         "debug:__node__.debug,"+
    //         "trace:__node__.trace,"+
    //         // "on:__node__.on,"+
    //         "status:__node__.status,"+
    //         // "send:function(msgs,cloneMsg){ __node__.send(__send__,__msgid__,msgs,cloneMsg);},"+
    //         // "done:__done__"+
    //     "};\n"+
    //     func+"\n"+
    // // "})(msg,__send__,__done__);";
    // "})(msg);";

    let script;

    try {

        let fnc = "return (" + func + ")";

        let functionText = "var results = null;"+
        //"results = (async function(msg,__send__,__done__){ "+
        "results = (async function(msg){ "+
            // "var __msgid__ = msg._msgid;"+
            "var node = {"+
                "id:__node__.id,"+
                "name:__node__.name,"+
                "path:__node__.path,"+
                // "outputCount:__node__.outputCount,"+
                "log:__node__.log,"+
                "error:__node__.error,"+
                "warn:__node__.warn,"+
                "debug:__node__.debug,"+
                "trace:__node__.trace,"+
                // "on:__node__.on,"+
                "status:__node__.status,"+
                // "send:function(msgs,cloneMsg){ __node__.send(__send__,__msgid__,msgs,cloneMsg);},"+
                // "done:__done__"+
            "};\n"+
            fnc+"\n"+
        // "})(msg,__send__,__done__);";
        "})(msg);";

        script = vm.createScript(functionText, createVMOpt(node, ""));

    } catch (err) {

        let functionText = "var results = null;"+
        //"results = (async function(msg,__send__,__done__){ "+
        "results = (async function(msg){ "+
            // "var __msgid__ = msg._msgid;"+
            "var node = {"+
                "id:__node__.id,"+
                "name:__node__.name,"+
                "path:__node__.path,"+
                // "outputCount:__node__.outputCount,"+
                "log:__node__.log,"+
                "error:__node__.error,"+
                "warn:__node__.warn,"+
                "debug:__node__.debug,"+
                "trace:__node__.trace,"+
                // "on:__node__.on,"+
                "status:__node__.status,"+
                // "send:function(msgs,cloneMsg){ __node__.send(__send__,__msgid__,msgs,cloneMsg);},"+
                // "done:__done__"+
            "};\n"+
            func+"\n"+
        // "})(msg,__send__,__done__);";
        "})(msg);";

        script = vm.createScript(functionText, createVMOpt(node, ""));
    }

    let opts = {};

    script.runInContext(context, opts);
    await context.results.then(function(results) {

        done(undefined, results);

        // var duration = process.hrtime(start);
        // var converted = Math.floor((duration[0] * 1e9 + duration[1])/10000)/100;
        // node.metric("duration", msg, converted);
        // if (process.env.NODE_RED_FUNCTION_TIME) {
        //     node.status({fill:"yellow",shape:"dot",text:""+converted});
        // }
    }).catch(err => {
        if ((typeof err === "object") && err.hasOwnProperty("stack")) {
            //remove unwanted part
            var index = err.stack.search(/\n\s*at ContextifyScript.Script.runInContext/);
            err.stack = err.stack.slice(0, index).split('\n').slice(0,-1).join('\n');
            var stack = err.stack.split(/\r?\n/);

            //store the error in msg to be used in flows
            // msg.error = err;

            var line = 0;
            var errorMessage;
            if (stack.length > 0) {
                while (line < stack.length && stack[line].indexOf("ReferenceError") !== 0) {
                    line++;
                }

                if (line < stack.length) {
                    errorMessage = stack[line];
                    var m = /:(\d+):(\d+)$/.exec(stack[line+1]);
                    if (m) {
                        var lineno = Number(m[1])-1;
                        var cha = m[2];
                        errorMessage += " (line "+lineno+", col "+cha+")";
                    }
                }
            }
            if (!errorMessage) {
                errorMessage = err.toString();
            }
            done(errorMessage, undefined);
        }
        else if (typeof err === "string") {
            done(err, undefined);
        }
        else {
            done(JSON.stringify(err), undefined);
        }
    });

}


module.exports = {
    evaluate: evaluate
}