angular.module('app').controller('UsersEditController', function($rootScope, $scope, $location, growl, $routeParams, UserService) {
    var vm = this,
        id = $routeParams.id;

    vm.id = id;

    vm.save = function() {
        UserService.socket.emit('user_update', vm.user, function(err) {
            if (err) {
                growl.error(err);
            } else {
                if (id) {
                    growl.success('User updated successfully.');
                } else {
                    growl.success('User created successfully.');
                }

                $location.path('/users');
            }
        });
    };

    vm.loading = true;
    if (id) {
        UserService.socket.emit('user_get', id, function(err, user) {
            if (err) {
                growl.error(err);
                $location.path('/users');
            } else {
                vm.user = user;
            }

            vm.loading = false;
            $rootScope.$apply();
        });
    } else {
        vm.user = {
            username: '',
            password: '',
            email: ''
        };

        vm.loading = false;
    }
});