angular.module('app').controller('ContainerListController', function($scope, UserService, $location) {
    var vm = this;

    vm.refresh = function() {
        UserService.socket.emit('server_list', {}, function(err, servers) {
            if (err) {
                growl.error(err);
            } else {
                vm.servers = servers;
                $scope.$apply();
            }
        });
    };
    vm.refresh();

    vm.viewServer = function(id) {
        $location.path('/containers/servers/view/' + id);
    };

    vm.editServer = function(id) {
        $location.path('/containers/servers/edit/' + id);
    };
});