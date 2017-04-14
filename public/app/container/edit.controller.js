angular.module('app').controller('ContainerEditController', function($rootScope, $scope, $location, growl, $routeParams, UserService) {
    var vm = this,
        id = $routeParams.id;

    vm.id = id;

    vm.deleteServer = function() {
        if (confirm('Are you sure you want to delete this server?')) {
            UserService.socket.emit('server_delete', id, function(err) {
                if (err) {
                    growl.error(err);
                } else {
                    growl.success('Server deleted successfully.');
                    $location.path('/containers');
                }
            });
        }
    };

    vm.save = function() {
        UserService.socket.emit('server_update', vm.server, function(err) {
            if (err) {
                growl.error(err);
            } else {
                if (id) {
                    growl.success('Server updated successfully.');
                } else {
                    growl.success('Server created successfully.');
                }

                $location.path('/containers');
            }
        });
    };

    vm.loading = true;
    if (id) {
        UserService.socket.emit('server_get', id, function(err, server) {
            if (err) {
                growl.error(err);
                $location.path('/containers');
            } else {
                vm.server = server;
            }

            vm.loading = false;
            $rootScope.$apply();
        });
    } else {
        vm.server = {
            name: '',
            server: '',
            settings: {

            },
            auth: {
                type: 'password'
            }
        };

        vm.loading = false;
    }
});