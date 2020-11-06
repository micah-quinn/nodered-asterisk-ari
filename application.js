var connpool = require('./connection_pool.js');

module.exports = function(RED) {
   "use strict";

   function application(n) {
      RED.nodes.createNode(this,n);
      var node = this;
      this.name = n.name
      this.server = RED.nodes.getNode(n.server);
      this.conn = connpool.ariConnectionPool.setconn(this.server.credentials.url, this.server.credentials.username, this.server.credentials.password, this.name, node)
      this.on("close", function() {
         //this.conn.close()
      });
   }
   RED.nodes.registerType("application",application);

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

}
