var ari = require('ari-client');
var uuid = require('uuid')

function clientLoaded (client, app, node, id) {

   node.status({fill:"green",shape:"dot",text:"connected"});

   client.on('StasisStart', stasisStart);
   client.on('StasisEnd', stasisEnd);
   client.on('ChannelDtmfReceived', dtmfEvent);

   function stasisStart(event, channel) {
      var bridge = client.Bridge();
      bridge.create({type: 'mixing,dtmf_events'});

      client.bridges.addChannel({bridgeId: bridge.id, channel: channel.id},
         function (err) {
            if (err) {
               console.log(err);
            }
        });

      var channelid = ariConnectionPool.setchan(channel)
      var msg = {}
      msg.channel = channelid
      msg.client = id
      msg.payload = event
      node.send([msg, null])

   }

   function stasisEnd(event, channel){
      channel.removeAllListeners('ChannelDtmfReceived')
      var msg = {}
      msg.channel = channel.id
      msg.client = id
      msg.payload = event
      node.send([null, msg])
      //console.log(event)
   }

   function dtmfEvent(event, channel){
      var msg = {}
      msg.channel = channel.id
      msg.client = id
      msg.payload = event
      node.send([null, msg])
   }

   client.start(app);
}

var ariConnectionPool = (function() {
   var connections = {};
   var channels = {}
   var obj = {
      setconn: function(url, username, password, app, node) {
         var id = uuid.v4()
         ari.connect(url, username, password, function(err, client){
            if (err) {
               node.error(err);
            }
            client.id = id
            connections[id] = client
            //console.log("id = " + id)
            clientLoaded(client, app, node, id)
         });
         //connections[id]._id = id;
         //connections[id]._nodeCount = 0;
         //connections[id]._nodeCount += 1;
         return connections[id]
      },
      getconn : function(id){
         return connections[id]
      },
      close: function(connection) {
         connection._nodeCount -= 1;
         if (connection._nodeCount === 0) {
            delete connections[connection._id];
         }
      },
      setchan: function(channel){
         var id = channel.id
         channels[id] = channel
         return id
      },
      getchan: function(id){
         return channels[id]
      }
   };
   return obj;
}());

exports.ariConnectionPool = ariConnectionPool;
