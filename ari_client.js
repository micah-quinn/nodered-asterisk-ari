var ari = require('ari-client');
var uuid = require('uuid')
var prov = require('./provision.js')

module.exports = function(RED) {
    "use strict";

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
                    var id = client.id
                    connections[id] =client
                    clientLoaded(client, app, node,id)
                });
                //connections[id]._id = id;
                //connections[id]._nodeCount = 0;
                //connections[id]._nodeCount += 1;
                return connections[id];
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

    function clientLoaded (client, app, node, id) {
        node.status({fill:"green",shape:"dot",text:"connected"});
        function stasisStart(event, channel) {
            var dialed = event.args[0] === 'dialed';
            if (!dialed){
                var channelid = ariConnectionPool.setchan(channel)
                var msg = {}
                msg.channel = channelid
                msg.client = id
                msg.payload = event
                node.send([msg, null])
            }

        }
        function stasisEnd(event, channel){
            //console.log(event)
        }
        function dtmfEvent(event, channel){
            var msg = {}
            msg.channel = channel.id
            msg.client = id
            msg.payload = event
            node.send([null, msg])

        }
        client.on('StasisStart', stasisStart);
        //client.on('StasisEnd', stasisEnd);
        client.on('ChannelDtmfReceived', dtmfEvent);
        client.start(app);
    }

    function ari_client(n) {
        RED.nodes.createNode(this,n);
        var node = this;
        this.name = n.name
        this.sip_user = n.sip_user
        this.sip_password = n.sip_password
        this.server = RED.nodes.getNode(n.server);
        prov.provision(this.server.credentials.url, this.server.credentials.username, this.server.credentials.password, this.sip_user, this.sip_password)
        this.conn = ariConnectionPool.setconn(this.server.credentials.url, this.server.credentials.username, this.server.credentials.password, this.name, node)
        this.on("close", function() {
            //deprovision(this.server.credentials.url, this.server.credentials.username, this.server.credentials.password, this.sip_user)
            //this.conn.close()
        });
    }
    RED.nodes.registerType("ari_client",ari_client);



    function ari_playback(n) {
        RED.nodes.createNode(this,n);
        var node = this;
        this.media = n.media
        node.on('input', function (msg) {
          node.status({fill:"blue",shape:"dot"});
          var client = ariConnectionPool.getconn(msg.client)
          var channel = ariConnectionPool.getchan(msg.channel)
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
    RED.nodes.registerType("ari_playback",ari_playback);

    function ari_hangup(n) {
        RED.nodes.createNode(this,n);
        var node = this;
        node.on('input', function (msg) {
          node.status({fill:"blue",shape:"dot"});
            var channel = ariConnectionPool.getchan(msg.channel)
            channel.hangup(function(err) {
                if (err) {node.error(err);}
                node.status({})
            });
        });
    }
    RED.nodes.registerType("ari_hangup",ari_hangup);


    function ari_answer(n) {
        RED.nodes.createNode(this,n);
        var node = this;
        node.on('input', function (msg) {
          node.status({fill:"blue",shape:"dot"});
          var client = ariConnectionPool.getconn(msg.client)
          var channel = ariConnectionPool.getchan(msg.channel)
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
    RED.nodes.registerType("ari_answer",ari_answer);

    function ari_bridgedial(n){
        RED.nodes.createNode(this,n);
        var node = this;
        this.destination = n.destination
        this.callerId = n.callerId
        node.on('input', function (msg) {
          node.status({fill:"blue",shape:"dot"});
          var client = ariConnectionPool.getconn(msg.client)
          var channel = ariConnectionPool.getchan(msg.channel)
          // Create outbound channel
          var dialed = client.Channel();
          var bridge = client.Bridge();
          var bridgeid = bridge.id
          bridge.create({type: 'mixing, dtmf_events'}, function(err) {if (err) {throw err;}})
          client.start(bridgeid);
          dialed.on('StasisStart', function(event, dialed) {
            dialed.answer(function(err) {if (err) {throw err;}})
            bridge.addChannel({channel: [channel.id, dialed.id]}, function(err) {if (err) {throw err;}});
            var channelid = ariConnectionPool.setchan(dialed)
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
    RED.nodes.registerType("ari_bridgedial",ari_bridgedial);
}
