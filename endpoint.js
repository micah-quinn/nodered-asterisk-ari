var connpool = require('./connection_pool.js');
var prov = require('./provision.js')

module.exports = function(RED) {
   "use strict";

   function endpoint(n) {
      RED.nodes.createNode(this,n);
      var node = this;
      this.name = n.name
      this.sip_user = n.sip_user
      this.sip_password = n.sip_password
      this.server = RED.nodes.getNode(n.server);
      prov.provision(this.server.credentials.url, this.server.credentials.username, this.server.credentials.password, this.sip_user, this.sip_password)
      this.conn = connpool.ariConnectionPool.setconn(this.server.credentials.url, this.server.credentials.username, this.server.credentials.password, this.name, node)
      this.on("close", function() {
         //deprovision(this.server.credentials.url, this.server.credentials.username, this.server.credentials.password, this.sip_user)
         //this.conn.close()
      });
   }
   RED.nodes.registerType("endpoint",endpoint);

   function playback(n) {
      RED.nodes.createNode(this,n);
      var node = this;
      this.media = n.media
      node.on('input', function (msg) {
         node.status({fill:"blue",shape:"dot"});
         var client = connpool.ariConnectionPool.getconn(msg.client)
         var channel = connpool.ariConnectionPool.getchan(msg.channel)
         var playback = client.Playback();
         channel.play({media: this.media},
            playback, function(err, newPlayback) {if (err) {throw err;}});
            playback.on('PlaybackFinished', function(event, completedPlayback) {
               msg.payload = event
               node.send(msg)
               node.status({})
            });
         });

         this.on("close", function() {
            // Called when the node is shutdown - eg on redeploy.
            // Allows ports to be closed, connections dropped etc.
            // eg: node.client.disconnect();
         });
      }
      RED.nodes.registerType("playback",playback);

      function hangup(n) {
         RED.nodes.createNode(this,n);
         var node = this;
         node.on('input', function (msg) {
            node.status({fill:"blue",shape:"dot"});
            var channel = connpool.ariConnectionPool.getchan(msg.channel)
            channel.hangup(function(err) {
               if (err) {node.error(err);}
               node.status({})
            });
         });
      }
      RED.nodes.registerType("hangup",hangup);


      function answer(n) {
         RED.nodes.createNode(this,n);
         var node = this;
         node.on('input', function (msg) {
            node.status({fill:"blue",shape:"dot"});
            var client = connpool.ariConnectionPool.getconn(msg.client)
            var channel = connpool.ariConnectionPool.getchan(msg.channel)
            client.channels.answer({channelId: channel.id},function (err) {
               if (err) {node.error(err);}
               msg.payload = 'answered'
               node.send(msg)
               node.status({})
            });
         });

         this.on("close", function() {
            // Called when the node is shutdown - eg on redeploy.
            // Allows ports to be closed, connections dropped etc.
            // eg: node.client.disconnect();
         });
      }
      RED.nodes.registerType("answer",answer);

      function bridgedial(n){
         RED.nodes.createNode(this,n);
         var node = this;
         this.destination = n.destination
         this.callerId = n.callerId
         node.on('input', function (msg) {
            node.status({fill:"blue",shape:"dot"});
            var client = connpool.ariConnectionPool.getconn(msg.client)
            var channel = connpool.ariConnectionPool.getchan(msg.channel)
            // Create outbound channel
            var dialed = client.Channel();
            var bridge = client.Bridge();
            var bridgeid = bridge.id
            bridge.create({type: 'mixing, dtmf_events'}, function(err) {if (err) {throw err;}})
            client.start(bridgeid);
            dialed.on('StasisStart', function(event, dialed) {
               dialed.answer(function(err) {if (err) {throw err;}})
               bridge.addChannel({channel: [channel.id, dialed.id]}, function(err) {if (err) {throw err;}});
               var channelid = connpool.ariConnectionPool.setchan(dialed)
               var bmsg = {}
               bmsg.channel = channelid
               bmsg.client = client.id
               msg.type = "connected"
               bmsg.type = "connected"
               bmsg.payload = {bridge : bridge.id}
               msg.payload = {bridge : bridge.id}
               if (n.connected_event) {
                  node.send([msg, bmsg])
               }
            });
            dialed.on('StasisEnd', function(event, dialed) {
               bridge.destroy(function(err) {});
               msg.type = "ended"
               msg.payload = event
               if (n.ended_event) {
                  node.send([msg, null])
               }
               node.status({});
            });
            channel.on('StasisEnd', function(event, channel) {
               var msg = {}
               msg.type = "ended"
               msg.channel = dialed.id
               msg.client = client.id
               msg.payload = event
               bridge.destroy(function(err) {});
               if (n.ended_event) {
                  node.send([null, msg])
               }

               node.status({});
            });
            channel.on('ChannelDtmfReceived', function(event, channel){
               var msg = {}
               msg.type = "DTMF"
               msg.channel = channel.id
               msg.client = client.id
               msg.payload = event
               node.send([msg, null])
            });
            dialed.on('ChannelDtmfReceived', function(event, dialled){
               var msg = {}
               msg.type = "DTMF"
               msg.channel = dialled.id
               msg.client = client.id
               msg.payload = event
               node.send([null, msg])
            });

            dialed.originate({endpoint: this.destination, callerId: this.callerId, app: bridgeid, appArgs: 'dialed'}, function(err, response) {
               if (err) {throw err;}
            });
         });

         this.on("close", function() {
            // Called when the node is shutdown - eg on redeploy.
            // Allows ports to be closed, connections dropped etc.
            // eg: node.client.disconnect();
         });
      }
      RED.nodes.registerType("bridgedial",bridgedial);
   }
