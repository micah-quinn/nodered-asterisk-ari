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

}
