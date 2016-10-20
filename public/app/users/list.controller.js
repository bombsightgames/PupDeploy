angular.module('app').controller('UsersListController', function($scope, UserService, growl) {
    var vm = this;

    vm.refresh = function() {
        UserService.socket.emit('user_list', {}, function(err, users) {
            if (err) {
                growl.error(err);
            } else {
                vm.users = users;
                $scope.$apply();
            }
        });
    };
    vm.refresh();

    vm.deleteUser = function(id) {
        if (confirm('Are you sure you want to delete this user?')) {
            UserService.socket.emit('user_delete', id, function(err) {
                if (err) {
                    growl.error(err);
                } else {
                    growl.success('User deleted successfully.');
                    vm.refresh();
                }
            });
        }
    };
});