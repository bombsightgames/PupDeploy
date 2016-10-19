angular.module('app').controller('UsersListController', function($scope, UserService) {
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
});