angular.module('app').controller('ContainerViewController', function($rootScope, $scope, $location, growl, $routeParams, UserService) {
    var vm = this,
        id = $routeParams.id;

    vm.id = id;

    vm.loading = true;
    UserService.socket.emit('server_get', id, function(err, server) {
        if (err) {
            growl.error(err);
            $location.path('/containers');
        } else {
            vm.server = server;
        }

        vm.loading = false;
        $scope.$apply();
    });

});