angular.module('app').directive('pdHeader', function() {
    return {
        restrict: 'E',
        templateUrl: '/app/header/header.html',
        controller: function($rootScope, $scope, UserService) {
            $scope.logout = function() {
                UserService.logout();
            };

            $rootScope.$on('userData', function() {
                $scope.userData = UserService.userData;
            });
        }
    };
});